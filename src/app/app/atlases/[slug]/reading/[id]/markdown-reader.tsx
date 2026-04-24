"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface HighlightRange {
  id: string;
  /** Global char offset into the full markdown (not the current page). */
  start: number;
  end: number;
}

interface SelectionInfo {
  text: string;
  /** Global char offset into the full markdown. */
  start: number;
  end: number;
  rect: DOMRect;
}

interface MarkdownReaderProps {
  markdown: string;
  /**
   * Character offset of this page inside the full markdown. Selection events
   * and highlight overlays are translated against this so the caller always
   * deals in global offsets.
   */
  pageStart: number;
  pageEnd: number;
  highlights: HighlightRange[];
  activeHighlightId: string | null;
  onHighlightClick: (id: string) => void;
  onSelect: (sel: SelectionInfo | null) => void;
}

/**
 * Renders one page of markdown + overlays highlight spans.
 * Highlight offsets stay addressable against the full document, not the
 * currently-rendered slice.
 */
export function MarkdownReader({
  markdown,
  pageStart,
  pageEnd,
  highlights,
  activeHighlightId,
  onHighlightClick,
  onSelect,
}: MarkdownReaderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // --- Selection tracking ---
  React.useEffect(() => {
    function handleMouseUp() {
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

        const localStart = offsetFromContainerStart(
          container,
          range.startContainer,
          range.startOffset
        );
        const start = pageStart + localStart;
        const end = start + text.length;
        const rect = range.getBoundingClientRect();
        onSelect({ text, start, end, rect });
      }, 0);
    }

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [onSelect, pageStart]);

  // --- Overlay highlights after every render of this page ---
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Only overlay highlights that intersect the current page window, and
    // translate their offsets into page-local coordinates.
    const local = highlights
      .filter((h) => h.end > pageStart && h.start < pageEnd)
      .map((h) => ({
        id: h.id,
        start: Math.max(0, h.start - pageStart),
        end: Math.min(pageEnd - pageStart, h.end - pageStart),
      }))
      .filter((h) => h.end > h.start);
    applyHighlightOverlays(container, local, activeHighlightId, onHighlightClick);
  }, [highlights, activeHighlightId, markdown, pageStart, pageEnd, onHighlightClick]);

  return (
    <div ref={containerRef} className="prose-atlas select-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

/**
 * Walk text nodes in container (in order) to find the absolute character
 * offset for a given (node, offsetWithinNode). Page-local only.
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
  return total;
}

interface LocalRange {
  id: string;
  start: number;
  end: number;
}

function applyHighlightOverlays(
  container: HTMLElement,
  ranges: LocalRange[],
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
