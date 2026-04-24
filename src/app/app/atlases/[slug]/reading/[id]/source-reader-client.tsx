"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatRelative } from "@/lib/utils";
import { PdfUploadDialog } from "@/components/pdf-upload-dialog";
import type {
  Highlight,
  JournalEntry,
  Source,
  SourceSummary,
} from "@/lib/types";
import { MarkdownReader, type HighlightRange } from "./markdown-reader";
import { paginateMarkdown, pageOfOffset } from "./paginate";

type ReaderView = "markdown" | "iframe";

export function SourceReaderClient({
  slug,
  source: initialSource,
  initialHighlights,
  initialSourceJournals,
}: {
  slug: string;
  source: Source;
  initialHighlights: Highlight[];
  initialSourceJournals: JournalEntry[];
}) {
  const router = useRouter();
  const [source, setSource] = React.useState<Source>(initialSource);
  const [highlights, setHighlights] = React.useState<Highlight[]>(initialHighlights);
  const [sourceJournals, setSourceJournals] =
    React.useState<JournalEntry[]>(initialSourceJournals);
  const [progress, setProgress] = React.useState<number>(initialSource.reading_progress);
  const [activeHighlightId, setActiveHighlightId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [view, setView] = React.useState<ReaderView>("markdown");

  const [toolbar, setToolbar] = React.useState<{
    x: number;
    y: number;
    text: string;
    start: number;
    end: number;
  } | null>(null);

  // ------------------------------------------------------------------
  // 1. Auto-drive fetching for a pending consumable-with-url source.
  //    Fires once on mount; progress is observed via polling below.
  //    If /process responds with an error, bubble it into local state so
  //    the UI can break the user out of the 'pending' loading view.
  // ------------------------------------------------------------------
  const didKickProcess = React.useRef(false);
  const [kickError, setKickError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (didKickProcess.current) return;
    if (
      source.fetch_status === "pending" &&
      source.url &&
      source.resource_type === "consumable"
    ) {
      didKickProcess.current = true;
      (async () => {
        try {
          const res = await fetch(`/api/sources/${source.id}/process`, { method: "POST" });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setKickError(j.error ?? `HTTP ${res.status}`);
            // Reflect the failure locally so the user sees NoContentMode
            // instead of a perpetual skeleton.
            setSource((prev) => ({
              ...prev,
              fetch_status: "failed",
              fetch_error: j.error ?? `process HTTP ${res.status}`,
            }));
            return;
          }
          const j = await res.json();
          if (j.source) {
            setSource((prev) => ({ ...prev, ...j.source }));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "network error";
          setKickError(msg);
          setSource((prev) => ({
            ...prev,
            fetch_status: "failed",
            fetch_error: `process request failed: ${msg}`,
          }));
        }
      })();
    }
  }, [source.fetch_status, source.id, source.url, source.resource_type]);

  // ------------------------------------------------------------------
  // 2. Poll for status transitions while the source is not final.
  // ------------------------------------------------------------------
  // 2. Poll for status transitions while the source is not final.
  //
  // A source in `pending` is only *transient* if the auto-kick path can
  // actually drive it forward — i.e. consumable + URL. Anything else
  // (external / physical / missing URL) is waiting on a user decision and
  // should render NoContentMode immediately instead of a perpetual spinner.
  // ------------------------------------------------------------------
  const willBeProcessed =
    source.fetch_status === "pending" &&
    !!source.url &&
    source.resource_type === "consumable";

  const isActivelyProcessing =
    source.fetch_status === "fetching" || source.fetch_status === "summarizing";

  const isTransient = willBeProcessed || isActivelyProcessing;

  // Watchdog: if the source is still in a transient state after ~45s without
  // changing, surface a "looks stuck" escape hatch so the user isn't stranded
  // on the loading screen forever (serverless timeouts, LLM rate-limit, etc).
  const transientStartedAt = React.useRef<number | null>(null);
  const lastSeenStatus = React.useRef<string | null>(null);
  const [stuck, setStuck] = React.useState(false);

  React.useEffect(() => {
    if (!isTransient) {
      transientStartedAt.current = null;
      lastSeenStatus.current = null;
      setStuck(false);
      return;
    }
    if (
      transientStartedAt.current === null ||
      lastSeenStatus.current !== source.fetch_status
    ) {
      transientStartedAt.current = Date.now();
      lastSeenStatus.current = source.fetch_status;
      setStuck(false);
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/sources/${source.id}`);
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled && j.source) {
          setSource(j.source as Source);
        }
      } catch {
        /* ignore */
      }
      if (
        !cancelled &&
        transientStartedAt.current !== null &&
        Date.now() - transientStartedAt.current > 45_000
      ) {
        setStuck(true);
      }
    };
    const int = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(int);
    };
  }, [isTransient, source.fetch_status, source.id]);

  // ------------------------------------------------------------------
  // 3. Progress save (used only in markdown mode).
  // ------------------------------------------------------------------
  const progressDebounceRef = React.useRef<NodeJS.Timeout | null>(null);
  function updateProgress(pct: number) {
    setProgress(pct);
    if (progressDebounceRef.current) clearTimeout(progressDebounceRef.current);
    progressDebounceRef.current = setTimeout(() => {
      fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading_progress: pct }),
      }).catch(() => {
        /* ignore */
      });
    }, 1000);
  }

  async function markRead() {
    setBusy(true);
    try {
      const r = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read", reading_progress: 100 }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.source) setSource(j.source as Source);
        setProgress(100);
      }
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------
  // 4. Highlight management (markdown mode).
  // ------------------------------------------------------------------
  function onSelectionInside(
    sel: { text: string; start: number; end: number; rect: DOMRect } | null
  ) {
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

  async function promoteHighlightToJournal(id: string) {
    const res = await fetch(`/api/highlights/${id}/to-journal`, { method: "POST" });
    const j = await res.json();
    if (res.ok) {
      setHighlights((prev) =>
        prev.map((h) => (h.id === id ? { ...h, journal_entry_id: j.journal_entry_id } : h))
      );
    }
  }

  // ------------------------------------------------------------------
  // 5. Source-level journal (used in both modes, but especially NoContent).
  // ------------------------------------------------------------------
  async function addSourceJournal(text: string) {
    const res = await fetch(`/api/atlases/${slug}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source_ref: source.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`保存随记失败: ${j.error ?? res.status}`);
      return;
    }
    const j = await res.json();
    setSourceJournals((prev) => [j.entry as JournalEntry, ...prev]);
  }

  async function removeSourceJournal(id: string) {
    const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`删除失败: ${j.error ?? res.status}`);
      return;
    }
    setSourceJournals((prev) => prev.filter((e) => e.id !== id));
  }

  // ------------------------------------------------------------------
  // 6. Recovery actions (retry fetch, paste, upload pdf).
  // ------------------------------------------------------------------
  const [pdfOpen, setPdfOpen] = React.useState(false);
  const [pasteOpen, setPasteOpen] = React.useState(false);

  async function retryFetch() {
    if (!source.url) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sources/${source.id}/process`, { method: "POST" });
      if (r.ok) {
        const j = await r.json();
        if (j.source) setSource(j.source as Source);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitPaste(text: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/sources/${source.id}/paste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title: source.title }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(`保存失败: ${j.error ?? r.status}`);
        return;
      }
      const j = await r.json();
      if (j.source) setSource(j.source as Source);
      setPasteOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const ranges: HighlightRange[] = highlights.map((h) => ({
    id: h.id,
    start: h.start_offset,
    end: h.end_offset,
  }));

  const hasContent = !!source.raw_content && source.raw_content.length > 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link
          href={`/app/atlases/${slug}/reading`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回阅读清单
        </Link>
        <div className="flex items-center gap-2">
          {hasContent && source.url && source.resource_type === "consumable" ? (
            <ReaderViewToggle view={view} onChange={setView} />
          ) : null}
          {hasContent || sourceJournals.length > 0 ? (
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
          ) : null}
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
        {(hasContent || sourceJournals.length > 0) && progress > 0 ? (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* Body — pick mode */}
      {isTransient ? (
        <LoadingMode
          source={source}
          stuck={stuck}
          kickError={kickError}
          onRetry={retryFetch}
          onForceJournal={() => {
            // Let the user bail out of the loader without waiting — flip the
            // local view to NoContentMode by marking the source failed
            // locally. The server row still reflects reality.
            setSource((prev) => ({
              ...prev,
              fetch_status: "failed",
              fetch_error: prev.fetch_error ?? "用户放弃等待",
            }));
          }}
        />
      ) : hasContent && view === "iframe" && source.url ? (
        <IframeMode
          slug={slug}
          source={source}
          journals={sourceJournals}
          onAddJournal={addSourceJournal}
          onRemoveJournal={removeSourceJournal}
        />
      ) : hasContent ? (
        <MarkdownMode
          source={source}
          highlights={highlights}
          ranges={ranges}
          activeHighlightId={activeHighlightId}
          setActiveHighlightId={setActiveHighlightId}
          onSelectionInside={onSelectionInside}
          onProgress={updateProgress}
          onDeleteHighlight={removeHighlight}
          onPromoteHighlight={promoteHighlightToJournal}
        />
      ) : (
        <NoContentMode
          source={source}
          slug={slug}
          journals={sourceJournals}
          busy={busy}
          onRetryFetch={retryFetch}
          onOpenPaste={() => setPasteOpen(true)}
          onOpenPdf={() => setPdfOpen(true)}
          onAddJournal={addSourceJournal}
          onRemoveJournal={removeSourceJournal}
        />
      )}

      {/* Floating toolbar only appears in markdown mode via its selection events */}
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

      {/* Paste dialog */}
      {pasteOpen ? (
        <PasteDialog
          title={source.title}
          onClose={() => setPasteOpen(false)}
          onSubmit={submitPaste}
          busy={busy}
        />
      ) : null}

      {/* PDF upload dialog (works for any source — even non-physical ones that
          want to attach a PDF of the same article). */}
      <PdfUploadDialog
        open={pdfOpen}
        resourceTitle={source.title}
        onClose={() => setPdfOpen(false)}
        createSource={async () => source.id}
        onIngested={() => {
          setPdfOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// Sub-views
// ----------------------------------------------------------------------

function LoadingMode({
  source,
  stuck,
  kickError,
  onRetry,
  onForceJournal,
}: {
  source: Source;
  stuck: boolean;
  kickError: string | null;
  onRetry: () => void;
  onForceJournal: () => void;
}) {
  const label: Record<Source["fetch_status"], string> = {
    pending: "排队中…",
    fetching: "抓取正文中…",
    summarizing: "AI 生成摘要中…",
    ready: "准备就绪",
    failed: "抓取失败",
  };
  return (
    <div className="rounded-lg border border-border/60 bg-card/20 p-10">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label[source.fetch_status]}
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted/60" />
      </div>

      {stuck ? (
        <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
          <div className="font-medium text-amber-300">看起来卡住了</div>
          <p className="mt-1 text-muted-foreground">
            抓取或 AI 摘要超过 45 秒还没有进展。可能是网站拒绝爬虫、LLM
            限流、或网络波动。
            {kickError ? (
              <>
                {" "}
                后端报错：<code className="rounded bg-muted px-1">{kickError}</code>
              </>
            ) : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onRetry}
              className="rounded border border-border bg-background px-2 py-1 hover:border-foreground/40"
            >
              重试抓取
            </button>
            <button
              onClick={onForceJournal}
              className="rounded border border-border bg-background px-2 py-1 hover:border-foreground/40"
            >
              跳过抓取 · 直接记随记
            </button>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-border bg-background px-2 py-1 hover:border-foreground/40"
              >
                在新标签打开原文
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-xs text-muted-foreground">
          需要 10-30 秒 · 完成后页面会自动刷新
        </p>
      )}
    </div>
  );
}

function MarkdownMode({
  source,
  highlights,
  ranges,
  activeHighlightId,
  setActiveHighlightId,
  onSelectionInside,
  onProgress,
  onDeleteHighlight,
  onPromoteHighlight,
}: {
  source: Source;
  highlights: Highlight[];
  ranges: HighlightRange[];
  activeHighlightId: string | null;
  setActiveHighlightId: (id: string | null) => void;
  onSelectionInside: (sel: { text: string; start: number; end: number; rect: DOMRect } | null) => void;
  onProgress: (pct: number) => void;
  onDeleteHighlight: (id: string) => void;
  onPromoteHighlight: (id: string) => void;
}) {
  const markdown = source.raw_content ?? "";
  const pages = React.useMemo(() => paginateMarkdown(markdown), [markdown]);

  // Restore page from URL (?page=N 1-indexed), otherwise from progress. Keep
  // the index clamped so stale links don't crash the reader.
  const [currentPage, setCurrentPage] = React.useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = Number(sp.get("page"));
    if (Number.isFinite(fromUrl) && fromUrl >= 1) {
      return Math.min(pages.length - 1, Math.max(0, fromUrl - 1));
    }
    // Derive initial page from saved reading_progress.
    if (source.reading_progress > 0 && source.reading_progress < 100) {
      return Math.min(
        pages.length - 1,
        Math.max(0, Math.round((source.reading_progress / 100) * pages.length) - 1)
      );
    }
    return 0;
  });

  const pageCount = pages.length;
  const page = pages[Math.min(currentPage, pageCount - 1)];

  // Persist progress + URL ?page= when turning pages.
  React.useEffect(() => {
    if (pageCount === 0) return;
    const pct = Math.round(((currentPage + 1) / pageCount) * 100);
    onProgress(pct);

    const url = new URL(window.location.href);
    url.searchParams.set("page", String(currentPage + 1));
    window.history.replaceState(null, "", url.toString());

    // Scroll to top of the reader for a clean page-turn feel.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage, pageCount, onProgress]);

  const goPrev = React.useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);
  const goNext = React.useCallback(() => {
    setCurrentPage((p) => Math.min(pageCount - 1, p + 1));
  }, [pageCount]);

  // Keyboard navigation.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when the user is typing inside an input / textarea / contenteditable.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goNext();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  // Clicking a highlight in the sidebar should jump to the page containing it.
  const jumpToHighlight = React.useCallback(
    (id: string) => {
      setActiveHighlightId(id);
      const h = highlights.find((x) => x.id === id);
      if (!h) return;
      const target = pageOfOffset(pages, h.start_offset);
      if (target !== currentPage) setCurrentPage(target);
    },
    [highlights, pages, currentPage, setActiveHighlightId]
  );

  // Count highlights that live on the currently-visible page (for sidebar hint).
  const highlightsOnPage = React.useMemo(
    () =>
      highlights.filter((h) => h.end_offset > page.start && h.start_offset < page.end)
        .length,
    [highlights, page.start, page.end]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr),320px]">
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/60 bg-card/20 px-8 py-10">
          <MarkdownReader
            markdown={page.body}
            pageStart={page.start}
            pageEnd={page.end}
            highlights={ranges}
            activeHighlightId={activeHighlightId}
            onHighlightClick={jumpToHighlight}
            onSelect={onSelectionInside}
          />
        </div>

        <PageControls
          currentPage={currentPage}
          pageCount={pageCount}
          onPrev={goPrev}
          onNext={goNext}
          onJump={setCurrentPage}
        />
      </div>

      <aside className="lg:sticky lg:top-4 lg:h-fit">
        <HighlightSidebar
          highlights={highlights}
          activeId={activeHighlightId}
          highlightsOnPage={highlightsOnPage}
          onClickItem={jumpToHighlight}
          onDelete={onDeleteHighlight}
          onPromote={onPromoteHighlight}
        />
      </aside>
    </div>
  );
}

function PageControls({
  currentPage,
  pageCount,
  onPrev,
  onNext,
  onJump,
}: {
  currentPage: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (p: number) => void;
}) {
  const [jumpValue, setJumpValue] = React.useState("");

  function submitJump(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpValue);
    if (Number.isFinite(n) && n >= 1 && n <= pageCount) {
      onJump(Math.round(n) - 1);
      setJumpValue("");
    }
  }

  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/30 px-4 py-2 text-sm">
      <button
        onClick={onPrev}
        disabled={currentPage === 0}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← 上一页
      </button>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          第 <span className="font-medium text-foreground tabular-nums">{currentPage + 1}</span> / {pageCount} 页
        </span>
        <form onSubmit={submitJump} className="flex items-center gap-1">
          <input
            type="text"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            placeholder="跳到"
            className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </form>
        <span className="text-[10px] text-muted-foreground/60">
          ← → 翻页
        </span>
      </div>

      <button
        onClick={onNext}
        disabled={currentPage >= pageCount - 1}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        下一页 →
      </button>
    </div>
  );
}

function IframeMode({
  source,
  journals,
  onAddJournal,
  onRemoveJournal,
}: {
  slug: string;
  source: Source;
  journals: JournalEntry[];
  onAddJournal: (text: string) => Promise<void>;
  onRemoveJournal: (id: string) => Promise<void>;
}) {
  // iframes get blocked by many sites via X-Frame-Options / CSP.
  // Provide a hard fallback: detect load failure with a timeout and offer an
  // escape hatch.
  const [blocked, setBlocked] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!loadedRef.current) setBlocked(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [source.url]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr),380px]">
      <div className="relative min-w-0 overflow-hidden rounded-lg border border-border/60 bg-card/20">
        {blocked ? (
          <div className="flex h-[720px] flex-col items-center justify-center gap-3 p-8 text-center">
            <Globe className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-foreground">
              这个网站不允许被嵌入阅读
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              很多站点（知乎、微信公众号、付费文章）通过 X-Frame-Options
              禁止 iframe 嵌入。点下方按钮去原网页阅读，右侧随手记随记即可。
            </p>
            <a
              href={source.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/20"
            >
              <ExternalLink className="h-3.5 w-3.5" /> 在新标签打开
            </a>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={source.url ?? ""}
            className="h-[720px] w-full bg-white"
            onLoad={() => {
              loadedRef.current = true;
            }}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <aside className="lg:sticky lg:top-4 lg:h-fit">
        <JournalSidePanel
          journals={journals}
          onAdd={onAddJournal}
          onRemove={onRemoveJournal}
          hint="边读边记 · 每条独立保存"
        />
      </aside>
    </div>
  );
}

function NoContentMode({
  source,
  busy,
  onRetryFetch,
  onOpenPaste,
  onOpenPdf,
}: {
  source: Source;
  slug: string;
  journals: JournalEntry[];
  busy: boolean;
  onRetryFetch: () => void;
  onOpenPaste: () => void;
  onOpenPdf: () => void;
  onAddJournal: (text: string) => Promise<void>;
  onRemoveJournal: (id: string) => Promise<void>;
}) {
  const isFailed = source.fetch_status === "failed";
  const canRetry = !!source.url;

  const hint = isFailed
    ? `抓取失败${source.fetch_error ? `：${source.fetch_error}` : ""} · 换一种方式把内容放进来`
    : "这条源还没有可用的正文 · 选一种方式提供内容";

  return (
    <div className="mx-auto max-w-2xl">
      <div
        className={cn(
          "rounded-lg border p-8",
          isFailed
            ? "border-destructive/30 bg-destructive/5"
            : "border-primary/20 bg-primary/5"
        )}
      >
        <div className="flex items-start gap-3">
          <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {isFailed ? "无法抓到正文" : "还没有正文可读"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {canRetry ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetryFetch}
              disabled={busy}
              className="justify-start"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              重试抓取
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenPdf}
            disabled={busy}
            className="justify-start"
          >
            <Upload className="h-3.5 w-3.5" /> 上传 PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenPaste}
            disabled={busy}
            className="justify-start"
          >
            <FileText className="h-3.5 w-3.5" /> 粘贴正文
          </Button>
        </div>
        <p className="mt-5 text-[11px] text-muted-foreground">
          提供内容后，你就可以在这里划线、随记、生成闪卡和知识库。
        </p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Shared widgets
// ----------------------------------------------------------------------

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
  highlightsOnPage,
  onClickItem,
  onDelete,
  onPromote,
}: {
  highlights: Highlight[];
  activeId: string | null;
  highlightsOnPage?: number;
  onClickItem: (id: string) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          高亮 ({highlights.length}
          {typeof highlightsOnPage === "number" && highlightsOnPage > 0
            ? ` · ${highlightsOnPage} 在本页`
            : ""}
          )
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

function JournalSidePanel({
  journals,
  onAdd,
  onRemove,
  hint,
}: {
  journals: JournalEntry[];
  onAdd: ((text: string) => Promise<void>) | null;
  onRemove: (id: string) => Promise<void>;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          随记
        </div>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>

      {onAdd ? (
        <div className="mb-3">
          <JournalComposer onSubmit={onAdd} compact placeholder="新的想法…" />
        </div>
      ) : null}

      {journals.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          还没有随记
        </div>
      ) : (
        <ul className="space-y-2">
          {journals.map((j) => (
            <li
              key={j.id}
              className="group rounded-md border border-border/50 bg-background/40 p-2"
            >
              <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
                {j.text}
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {formatRelative(j.created_at)}
                  {j.status !== "raw" ? (
                    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-[9px] text-primary">
                      <Sparkles className="h-2.5 w-2.5" />
                      {j.status === "distilled" ? "已蒸馏" : j.status}
                    </span>
                  ) : null}
                </span>
                {j.status === "raw" ? (
                  <button
                    onClick={() => {
                      if (confirm("删除这条随记？")) onRemove(j.id);
                    }}
                    className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  >
                    删除
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JournalComposer({
  onSubmit,
  placeholder,
  compact,
}: {
  onSubmit: (text: string) => Promise<void>;
  placeholder: string;
  compact?: boolean;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={compact ? 2 : 4}
        disabled={busy}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {text.length > 0 ? `${text.length} 字` : ""}
        </span>
        <Button size="sm" onClick={submit} disabled={busy || text.trim().length === 0}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
        </Button>
      </div>
    </div>
  );
}

function ReaderViewToggle({
  view,
  onChange,
}: {
  view: ReaderView;
  onChange: (v: ReaderView) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/60 bg-card/50 text-xs">
      <button
        onClick={() => onChange("markdown")}
        className={cn(
          "px-2 py-1 transition-colors",
          view === "markdown"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Markdown
      </button>
      <button
        onClick={() => onChange("iframe")}
        className={cn(
          "px-2 py-1 transition-colors",
          view === "iframe"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        原网页
      </button>
    </div>
  );
}

function PasteDialog({
  title,
  onClose,
  onSubmit,
  busy,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
  busy: boolean;
}) {
  const [text, setText] = React.useState("");
  const disabled = text.trim().length < 20 || busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">粘贴正文或要点</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{title}</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <Textarea
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴章节要点 / 核心观点 / 摘抄（≥20 字）… AI 会帮你生成摘要并归档到知识库。"
            disabled={busy}
          />
          <div className="text-[10px] text-muted-foreground">
            {text.trim().length} 字 · 至少 20 字
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={() => onSubmit(text.trim())} disabled={disabled}>
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                保存中…
              </>
            ) : (
              "保存并生成摘要"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
