"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Check, Sparkles, Trash2, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Highlight, Source, SourceSummary } from "@/lib/types";
import { MarkdownReader, type HighlightRange } from "./markdown-reader";

export function SourceReaderClient({
  slug,
  source,
  initialHighlights,
}: {
  slug: string;
  source: Source;
  initialHighlights: Highlight[];
}) {
  const router = useRouter();
  const [highlights, setHighlights] = React.useState<Highlight[]>(initialHighlights);
  const [progress, setProgress] = React.useState<number>(source.reading_progress);
  const [activeHighlightId, setActiveHighlightId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Floating toolbar state driven by selection
  const [toolbar, setToolbar] = React.useState<{
    x: number;
    y: number;
    text: string;
    start: number;
    end: number;
  } | null>(null);

  const readerRef = React.useRef<HTMLDivElement>(null);

  async function saveProgress(pct: number) {
    // Called heavily — keep the request tiny and don't await the UI state.
    try {
      await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading_progress: pct }),
      });
    } catch {
      /* ignore */
    }
  }

  // Debounced progress save
  const progressDebounceRef = React.useRef<NodeJS.Timeout | null>(null);
  function updateProgress(pct: number) {
    setProgress(pct);
    if (progressDebounceRef.current) clearTimeout(progressDebounceRef.current);
    progressDebounceRef.current = setTimeout(() => saveProgress(pct), 1000);
  }

  async function markRead() {
    setBusy(true);
    try {
      await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read", reading_progress: 100 }),
      });
      setProgress(100);
    } finally {
      setBusy(false);
    }
  }

  function onSelectionInside(sel: { text: string; start: number; end: number; rect: DOMRect } | null) {
    if (!sel || sel.text.trim().length === 0) {
      setToolbar(null);
      return;
    }
    setToolbar({
      x: sel.rect.left + sel.rect.width / 2,
      y: sel.rect.top - 8,
      text: sel.text,
      start: sel.start,
      end: sel.end,
    });
  }

  async function createHighlight(opts: { toJournal: boolean }) {
    if (!toolbar) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${source.id}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: toolbar.text,
          start_offset: toolbar.start,
          end_offset: toolbar.end,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(`创建高亮失败: ${j.error}`);
        return;
      }
      const newHl: Highlight = j.highlight;
      setHighlights((prev) => [...prev, newHl].sort((a, b) => a.start_offset - b.start_offset));

      if (opts.toJournal) {
        const r2 = await fetch(`/api/highlights/${newHl.id}/to-journal`, { method: "POST" });
        const j2 = await r2.json();
        if (r2.ok) {
          setHighlights((prev) =>
            prev.map((h) =>
              h.id === newHl.id ? { ...h, journal_entry_id: j2.journal_entry_id } : h
            )
          );
        }
      }

      setToolbar(null);
      window.getSelection()?.removeAllRanges();
    } finally {
      setBusy(false);
    }
  }

  async function removeHighlight(id: string) {
    await fetch(`/api/highlights/${id}`, { method: "DELETE" });
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    if (activeHighlightId === id) setActiveHighlightId(null);
  }

  async function promoteToJournal(id: string) {
    const res = await fetch(`/api/highlights/${id}/to-journal`, { method: "POST" });
    const j = await res.json();
    if (res.ok) {
      setHighlights((prev) =>
        prev.map((h) => (h.id === id ? { ...h, journal_entry_id: j.journal_entry_id } : h))
      );
    }
  }

  const ranges: HighlightRange[] = highlights.map((h) => ({
    id: h.id,
    start: h.start_offset,
    end: h.end_offset,
  }));

  const hasContent = source.raw_content && source.raw_content.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link
          href={`/app/atlases/${slug}/sources`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回来源列表
        </Link>
        <div className="flex items-center gap-2">
          <div className="text-xs tabular-nums text-muted-foreground">
            已读 {progress}%
          </div>
          {progress < 100 ? (
            <Button size="sm" variant="outline" onClick={markRead} disabled={busy}>
              <Check className="h-3.5 w-3.5" />
              标记已读
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
              <Check className="h-3 w-3" /> 已读完
            </span>
          )}
        </div>
      </header>

      {/* Top card */}
      <div className="mb-6 rounded-lg border border-border/60 bg-card/40 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">
            {source.resource_type === "consumable"
              ? "可在线读"
              : source.resource_type === "external"
                ? "需外部看"
                : "实体书"}
          </span>
          {source.author ? <span>{source.author}</span> : null}
          {source.pub_date ? <span>· {source.pub_date}</span> : null}
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{source.title}</h1>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {source.url} <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <SummaryBlock summary={source.summary} />
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Reader + sidebar */}
      {hasContent ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
          <div ref={readerRef} className="min-w-0 rounded-lg border border-border/60 bg-card/20 p-6">
            <MarkdownReader
              markdown={source.raw_content!}
              highlights={ranges}
              activeHighlightId={activeHighlightId}
              onHighlightClick={setActiveHighlightId}
              onSelect={onSelectionInside}
              onProgress={updateProgress}
            />
          </div>
          <aside className="lg:sticky lg:top-4 lg:h-fit">
            <HighlightSidebar
              highlights={highlights}
              activeId={activeHighlightId}
              onClickItem={setActiveHighlightId}
              onDelete={removeHighlight}
              onPromote={promoteToJournal}
            />
          </aside>
        </div>
      ) : (
        <EmptyContentHint slug={slug} source={source} />
      )}

      {/* Floating toolbar */}
      {toolbar ? (
        <FloatingToolbar
          x={toolbar.x}
          y={toolbar.y}
          onHighlight={() => createHighlight({ toJournal: false })}
          onToJournal={() => createHighlight({ toJournal: true })}
          onCancel={() => setToolbar(null)}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function SummaryBlock({ summary }: { summary: SourceSummary }) {
  if (!summary?.tl_dr && !summary?.why_relevant) return null;
  return (
    <div className="mt-3 space-y-2">
      {summary.why_relevant ? (
        <div className="rounded bg-primary/10 px-2 py-1.5 text-xs text-primary/90">
          💡 {summary.why_relevant}
        </div>
      ) : null}
      {summary.tl_dr ? (
        <p className="text-sm leading-relaxed text-foreground/85">{summary.tl_dr}</p>
      ) : null}
      {summary.key_claims && summary.key_claims.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {summary.key_claims.slice(0, 5).map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EmptyContentHint({ slug, source }: { slug: string; source: Source }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <div className="text-sm text-muted-foreground">
        这个 source 还没有抓到正文
        {source.resource_type !== "consumable"
          ? "（需要用户外部消化后粘要点）"
          : "（可能是抓取失败）"}
      </div>
      <Link
        href={`/app/atlases/${slug}/sources`}
        className="mt-3 inline-block text-sm text-primary hover:underline"
      >
        回到列表 · 点「粘贴正文」
      </Link>
    </div>
  );
}

function FloatingToolbar({
  x,
  y,
  onHighlight,
  onToJournal,
  onCancel,
  busy,
}: {
  x: number;
  y: number;
  onHighlight: () => void;
  onToJournal: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="pointer-events-auto fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border border-border bg-card p-1 shadow-xl"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <button
        onClick={onHighlight}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted"
      >
        <span className="h-2 w-2 rounded-sm bg-primary" /> 高亮
      </button>
      <button
        onClick={onToJournal}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
      >
        <Sparkles className="h-3 w-3" /> 转随记
      </button>
      <button
        onClick={onCancel}
        className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function HighlightSidebar({
  highlights,
  activeId,
  onClickItem,
  onDelete,
  onPromote,
}: {
  highlights: Highlight[];
  activeId: string | null;
  onClickItem: (id: string) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          高亮 ({highlights.length})
        </div>
      </div>
      {highlights.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          选中正文 → 「高亮」或「转随记」
        </div>
      ) : (
        <ul className="space-y-3">
          {highlights.map((h) => (
            <li
              key={h.id}
              className={cn(
                "cursor-pointer rounded-md border p-2 transition-colors",
                activeId === h.id
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60 hover:border-border"
              )}
              onClick={() => onClickItem(h.id)}
            >
              <div className="line-clamp-3 text-xs leading-relaxed text-foreground/90">
                {h.text}
              </div>
              <div className="mt-2 flex items-center justify-between">
                {h.journal_entry_id ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                    <Sparkles className="h-3 w-3" /> 已转随记
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(h.id);
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    转随记
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("删除这条高亮？")) onDelete(h.id);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
