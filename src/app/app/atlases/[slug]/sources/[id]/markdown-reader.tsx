"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface HighlightRange {
  id: string;
  start: number;
  end: number;
}

interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  rect: DOMRect;
}

interface MarkdownReaderProps {
  markdown: string;
  highlights: HighlightRange[];
  activeHighlightId: string | null;
  onHighlightClick: (id: string) => void;
  onSelect: (sel: SelectionInfo | null) => void;
  onProgress: (pct: number) => void;
}

/**
 * Renders markdown + overlays highlight background spans + emits selection
 * events with character offsets measured against the rendered plain text.
 *
 * Offsets are computed using document.createRange() + toString().length from
 * the start of the reader container to the selection anchor. This is stable
 * across re-renders as long as the markdown source doesn't change.
 */
export function MarkdownReader({
  markdown,
  highlights,
  activeHighlightId,
  onHighlightClick,
  onSelect,
  onProgress,
}: MarkdownReaderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // --- Selection tracking ---
  React.useEffect(() => {
    function handleMouseUp() {
      // Defer so selection is finalized
      setTimeout(() => {
        const sel = window.getSelection();
        const container = containerRef.current;
        if (!sel || !container) {
          onSelect(null);
          return;
        }
        if (sel.rangeCount === 0 || sel.isCollapsed) {
          onSelect(null);
          return;
        }
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) {
          onSelect(null);
          return;
        }
        const text = range.toString();
        if (!text.trim()) {
          onSelect(null);
          return;
        }

        const start = offsetFromContainerStart(container, range.startContainer, range.startOffset);
        const end = start + text.length;

        const rect = range.getBoundingClientRect();
        onSelect({ text, start, end, rect });
      }, 0);
    }

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [onSelect]);

  // --- Progress via IntersectionObserver on paragraph ends ---
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Track bottom-most scroll position as the user reads
    function computeProgress() {
      if (!container) return;
      const { top, height } = container.getBoundingClientRect();
      const viewportH = window.innerHeight;
      if (height <= 0) return;
      // How much of the container is above the viewport bottom
      const scrolledPastBottom = Math.max(0, Math.min(height, viewportH - top));
      const pct = Math.round((scrolledPastBottom / height) * 100);
      onProgress(Math.min(100, Math.max(0, pct)));
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        computeProgress();
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    computeProgress();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onProgress]);

  // --- Overlay highlights after render ---
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    applyHighlightOverlays(container, highlights, activeHighlightId, onHighlightClick);
  }, [highlights, activeHighlightId, markdown, onHighlightClick]);

  return (
    <div ref={containerRef} className="prose-atlas select-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

/**
 * Walk text nodes in container (in order) to find the absolute character
 * offset for a given (node, offsetWithinNode).
 */
function offsetFromContainerStart(
  container: HTMLElement,
  target: Node,
  offsetWithinTarget: number
): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === target) {
      return total + offsetWithinTarget;
    }
    total += node.textContent?.length ?? 0;
    node = walker.nextNode();
  }
  // Fallback: target wasn't inside container (shouldn't normally happen)
  return total;
}

/**
 * For each highlight range, wrap the corresponding text nodes in <mark> spans.
 * Runs after React render; removes previous overlays first.
 */
function applyHighlightOverlays(
  container: HTMLElement,
  ranges: HighlightRange[],
  activeId: string | null,
  onClick: (id: string) => void
) {
  // 1. Unwrap previous overlays (our marks carry data-hl-id)
  container.querySelectorAll("mark[data-hl-id]").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });

  if (ranges.length === 0) return;

  // 2. Build list of text nodes with their cumulative offsets
  const textNodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    textNodes.push({ node: node as Text, start: pos, end: pos + len });
    pos += len;
    node = walker.nextNode();
  }

  // 3. For each highlight range, slice text nodes and wrap the intersecting parts.
  //    Sort descending so later slices don't invalidate earlier node references.
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  for (const r of sorted) {
    for (let i = textNodes.length - 1; i >= 0; i--) {
      const tn = textNodes[i];
      if (tn.end <= r.start || tn.start >= r.end) continue;
      const nodeStartOffset = Math.max(0, r.start - tn.start);
      const nodeEndOffset = Math.min(tn.end - tn.start, r.end - tn.start);
      if (nodeEndOffset <= nodeStartOffset) continue;

      try {
        wrapNodeSlice(tn.node, nodeStartOffset, nodeEndOffset, r.id, activeId === r.id, onClick);
      } catch {
        // Node may have been mutated by earlier wrap; skip
      }
    }
  }
}

function wrapNodeSlice(
  textNode: Text,
  startOffset: number,
  endOffset: number,
  hlId: string,
  isActive: boolean,
  onClick: (id: string) => void
) {
  if (!textNode.parentNode) return;
  const full = textNode.textContent ?? "";
  const before = full.slice(0, startOffset);
  const slice = full.slice(startOffset, endOffset);
  const after = full.slice(endOffset);

  const parent = textNode.parentNode;
  const mark = document.createElement("mark");
  mark.setAttribute("data-hl-id", hlId);
  mark.textContent = slice;
  mark.style.cursor = "pointer";
  mark.style.background = isActive ? "rgba(139, 92, 246, 0.35)" : "rgba(139, 92, 246, 0.18)";
  mark.style.borderRadius = "2px";
  mark.style.padding = "0 1px";
  mark.style.color = "inherit";
  mark.onclick = (e) => {
    e.stopPropagation();
    onClick(hlId);
  };

  if (before) parent.insertBefore(document.createTextNode(before), textNode);
  parent.insertBefore(mark, textNode);
  if (after) parent.insertBefore(document.createTextNode(after), textNode);
  parent.removeChild(textNode);
}
