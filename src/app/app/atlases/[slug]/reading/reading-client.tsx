"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelative, cn } from "@/lib/utils";
import { BookOpen, Radio, PenLine, ExternalLink, Network, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Source, SourceOrigin } from "@/lib/types";

type FilterStatus = "all" | "unread" | "reading" | "read";
type FilterOrigin = "all" | SourceOrigin;

const ORIGIN_META: Record<SourceOrigin, { label: string; icon: React.ReactNode; tone: string }> = {
  path: { label: "学习计划", icon: <BookOpen className="h-3 w-3" />, tone: "text-primary" },
  subscription: { label: "订阅", icon: <Radio className="h-3 w-3" />, tone: "text-emerald-400" },
  manual: { label: "手动添加", icon: <PenLine className="h-3 w-3" />, tone: "text-amber-400" },
};

export function ReadingClient({
  slug,
  initial,
}: {
  slug: string;
  initial: Source[];
}) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = React.useState<FilterStatus>("all");
  const [filterOrigin, setFilterOrigin] = React.useState<FilterOrigin>("all");

  // Poll for pending rows
  React.useEffect(() => {
    const hasPending = initial.some(
      (s) =>
        s.fetch_status === "pending" ||
        s.fetch_status === "fetching" ||
        s.fetch_status === "summarizing"
    );
    if (!hasPending) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [initial, router]);

  const filtered = initial.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (filterOrigin !== "all" && s.origin !== filterOrigin) return false;
    return true;
  });

  const pendingCount = initial.filter(
    (s) => s.fetch_status === "pending" && !s.url
  ).length;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10 space-y-6">
      {/* Header + shortcut to recommendations */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">阅读清单</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            你已经入池准备读 / 在读 / 读完的内容
          </p>
        </div>
        <Link
          href={`/app/atlases/${slug}/recommendations`}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/20"
        >
          <Sparkles className="h-3.5 w-3.5" />
          去内容推荐添加
        </Link>
      </div>

      {/* Filters */}
      {initial.length > 0 ? (
        <div className="flex flex-wrap items-center gap-4 border-b border-border/60 pb-3">
          <FilterGroup
            label="状态"
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as FilterStatus)}
            options={[
              { v: "all", label: `全部 (${initial.length})` },
              {
                v: "unread",
                label: `未开始 (${initial.filter((s) => s.status === "unread").length})`,
              },
              {
                v: "reading",
                label: `在读 (${initial.filter((s) => s.status === "reading").length})`,
              },
              {
                v: "read",
                label: `已读 (${initial.filter((s) => s.status === "read").length})`,
              },
            ]}
          />
          <div className="h-4 w-px bg-border" />
          <FilterGroup
            label="来源"
            value={filterOrigin}
            onChange={(v) => setFilterOrigin(v as FilterOrigin)}
            options={[
              { v: "all", label: "全部" },
              { v: "path", label: ORIGIN_META.path.label },
              { v: "subscription", label: ORIGIN_META.subscription.label },
              { v: "manual", label: ORIGIN_META.manual.label },
            ]}
          />
        </div>
      ) : null}

      {pendingCount > 0 ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/85">
          你有 {pendingCount} 条未开始的源 · 点卡片进详情页边读边记
        </div>
      ) : null}

      {initial.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <div className="text-sm text-muted-foreground">
            阅读清单还是空的
          </div>
          <Link
            href={`/app/atlases/${slug}/recommendations`}
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            去内容推荐挑几条入池 →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          当前筛选条件下没有条目
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <SourceItem
              key={s.id}
              source={s}
              slug={slug}
              onChange={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs transition-colors",
              value === o.v
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SourceItem({
  source,
  slug,
  onChange,
}: {
  source: Source;
  slug: string;
  onChange: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [ingesting, setIngesting] = React.useState(false);

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm("从阅读清单删除这条？")) return;
    await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
    onChange();
  }

  async function retry(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`/api/sources/${source.id}/process`, { method: "POST" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function ingestWiki() {
    setIngesting(true);
    try {
      const r = await fetch(`/api/sources/${source.id}/ingest-wiki`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        alert(`入库失败：${j.error ?? "unknown"}`);
        return;
      }
      onChange();
    } finally {
      setIngesting(false);
    }
  }

  const originMeta = ORIGIN_META[source.origin];
  const detailHref = `/app/atlases/${slug}/reading/${source.id}`;

  // Everything about this card is now about getting the user to the reader
  // detail page. The detail page owns the modal-like flows (paste, retry,
  // journal-only). We keep summary / highlight metadata as glanceable context.
  return (
    <Link href={detailHref} className="block">
      <Card className="transition-colors hover:border-foreground/30">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge source={source} />
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]",
                    originMeta.tone
                  )}
                >
                  {originMeta.icon}
                  {originMeta.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelative(source.ingested_at)}
                </span>
              </div>
              <div className="mt-2">
                <span className="text-base font-semibold hover:text-primary">
                  {source.title}
                </span>
              </div>
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                >
                  {source.url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : null}
              {source.fetch_status === "ready" && source.reading_progress > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 max-w-48 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${source.reading_progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {source.reading_progress}%
                  </span>
                </div>
              ) : null}

              {/* Wiki ingest status */}
              {source.fetch_status === "ready" ? (
                <WikiIngestBadge
                  source={source}
                  slug={slug}
                  onIngest={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    ingestWiki();
                  }}
                  ingesting={ingesting}
                />
              ) : null}
              {source.summary?.why_relevant ? (
                <div className="mt-2 rounded bg-primary/10 px-2 py-1 text-xs text-primary/90">
                  💡 {source.summary.why_relevant}
                </div>
              ) : null}
              {source.summary?.tl_dr ? (
                <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                  {source.summary.tl_dr}
                </p>
              ) : null}
              {source.summary?.key_claims && source.summary.key_claims.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {source.summary.key_claims.slice(0, 3).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              ) : null}

              {/* Actionable hint for non-ready states — all roads lead to the
                  detail page, which handles paste / retry / journal-only. */}
              {source.fetch_status === "pending" && !source.url ? (
                <div className="mt-3 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary">
                  {pasteHint(source.resource_type)}
                </div>
              ) : null}

              {source.fetch_status === "failed" && source.fetch_error ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
                    抓取失败：{source.fetch_error}
                  </div>
                  {source.url ? (
                    <button
                      onClick={retry}
                      disabled={busy}
                      className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                    >
                      {busy ? "..." : "重试抓取"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              onClick={remove}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              删除
            </button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ source }: { source: Pick<Source, "fetch_status" | "resource_type" | "url"> }) {
  const needsManual = source.fetch_status === "pending" && !source.url;
  if (needsManual) {
    return <Badge variant="default">未开始</Badge>;
  }
  const map: Record<Source["fetch_status"], { label: string; variant: "default" | "outline" | "success" }> = {
    pending: { label: "排队中", variant: "outline" },
    fetching: { label: "抓取中...", variant: "default" },
    summarizing: { label: "AI 摘要中...", variant: "default" },
    ready: { label: "✓ 就绪", variant: "success" },
    failed: { label: "失败", variant: "outline" },
  };
  const { label, variant } = map[source.fetch_status];
  return <Badge variant={variant}>{label}</Badge>;
}

function pasteHint(type: Source["resource_type"]): string {
  if (type === "physical") {
    return "📖 实体书 · 点进详情页边读边记";
  }
  if (type === "external") {
    return "🎧 需外部消化 · 点进详情页边看边记";
  }
  return "📝 点进详情页边读边记或粘贴要点";
}

function WikiIngestBadge({
  source,
  slug,
  onIngest,
  ingesting,
}: {
  source: Source;
  slug: string;
  onIngest: (e: React.MouseEvent) => void;
  ingesting: boolean;
}) {
  const isIngested = !!source.wiki_ingested_at;
  const pageSlug = `source-${source.id.slice(0, 8)}`;

  if (isIngested) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <Link
          href={`/app/atlases/${slug}/wiki?page=${pageSlug}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-500/20"
        >
          <Network className="h-3 w-3" />
          已入库 · 查看 wiki
        </Link>
        <button
          onClick={onIngest}
          disabled={ingesting}
          className="text-muted-foreground hover:text-foreground"
        >
          {ingesting ? "重新入库中..." : "重新入库"}
        </button>
      </div>
    );
  }

  if (source.status === "read") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary">
          <Network className="h-3 w-3" />
          {ingesting ? "入库中..." : "等待入库"}
        </span>
        <button
          onClick={onIngest}
          disabled={ingesting}
          className="text-muted-foreground hover:text-foreground"
        >
          {ingesting ? "..." : "手动触发"}
        </button>
      </div>
    );
  }

  return null;
}
