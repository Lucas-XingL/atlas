"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ExternalLink, Loader2, Check, X, AlertTriangle, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

type Tier = "top" | "recommended" | "further";

interface Candidate {
  title: string;
  url: string;
  snippet: string;
  why_relevant: string;
  source_query: string;
  tier: Tier;
}

interface ProcessingSource {
  id: string;
  url: string | null;
  title: string;
  why_relevant?: string;
  status: "pending" | "processing" | "ready" | "failed";
  error?: string;
}

type Phase =
  | "idle"
  | "drafting"
  | "searching"
  | "picking"
  | "processing"
  | "done"
  | "error";

const TIER_META: Record<Tier, { label: string; desc: string; color: string }> = {
  top: { label: "必读", desc: "灯塔级，代表作", color: "text-primary" },
  recommended: { label: "推荐", desc: "重要参考", color: "text-foreground/90" },
  further: { label: "可选", desc: "补充阅读", color: "text-muted-foreground" },
};

const CONCURRENCY = 3;

export function KickstartClient({
  slug,
  name,
  thesis,
}: {
  slug: string;
  name: string;
  thesis: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [queries, setQueries] = React.useState<string[]>([]);
  const [activeQueryIdx, setActiveQueryIdx] = React.useState(0);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [processing, setProcessing] = React.useState<ProcessingSource[]>([]);
  const [pasteTarget, setPasteTarget] = React.useState<ProcessingSource | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function startRecommendation() {
    setError(null);
    setQueries([]);
    setCandidates([]);
    setSelected(new Set());
    setActiveQueryIdx(0);
    setPhase("drafting");

    try {
      const r1 = await fetch(`/api/atlases/${slug}/kickstart/queries`, { method: "POST" });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error ?? "draft queries failed");
      const qs: string[] = j1.queries ?? [];
      setQueries(qs);
      setPhase("searching");

      const ticker = setInterval(() => {
        setActiveQueryIdx((i) => (i + 1) % Math.max(1, qs.length));
      }, 2400);

      try {
        const r2 = await fetch(`/api/atlases/${slug}/kickstart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: qs }),
        });
        const j2 = await r2.json();
        if (!r2.ok) throw new Error(j2.error ?? "search failed");
        const picks: Candidate[] = j2.candidates ?? [];
        setCandidates(picks);
        setSelected(new Set(picks.filter((p) => p.tier !== "further").map((p) => p.url)));
        setPhase("picking");
      } finally {
        clearInterval(ticker);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
      setPhase("error");
    }
  }

  async function acceptAndProcess() {
    const picks = candidates.filter((c) => selected.has(c.url));
    if (picks.length === 0) {
      setError("请至少选一条");
      return;
    }
    setError(null);

    // Step 1: insert all as pending (fast)
    let inserted: Array<{ id: string; url: string; title: string }> = [];
    try {
      const res = await fetch(`/api/atlases/${slug}/kickstart/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          picks: picks.map((p) => ({
            url: p.url,
            title: p.title,
            why_relevant: p.why_relevant,
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "accept failed");
      inserted = j.sources ?? [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "accept failed");
      setPhase("error");
      return;
    }

    const initial: ProcessingSource[] = inserted.map((s) => {
      const pick = picks.find((p) => p.url === s.url);
      return {
        id: s.id,
        url: s.url,
        title: s.title,
        why_relevant: pick?.why_relevant,
        status: "pending",
      };
    });
    setProcessing(initial);
    setPhase("processing");

    // Step 2: process in bounded-concurrency pool
    await processPool(initial, CONCURRENCY, async (item) => {
      updateOne(item.id, { status: "processing" });
      try {
        const res = await fetch(`/api/sources/${item.id}/process`, { method: "POST" });
        const j = await res.json();
        if (!res.ok) {
          updateOne(item.id, { status: "failed", error: j.error ?? `HTTP ${res.status}` });
        } else {
          updateOne(item.id, { status: "ready" });
        }
      } catch (err) {
        updateOne(item.id, {
          status: "failed",
          error: err instanceof Error ? err.message : "network",
        });
      }
    });

    setPhase("done");
  }

  function updateOne(id: string, patch: Partial<ProcessingSource>) {
    setProcessing((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  async function retryOne(item: ProcessingSource) {
    updateOne(item.id, { status: "processing", error: undefined });
    try {
      const res = await fetch(`/api/sources/${item.id}/process`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        updateOne(item.id, { status: "failed", error: j.error ?? `HTTP ${res.status}` });
      } else {
        updateOne(item.id, { status: "ready" });
      }
    } catch (err) {
      updateOne(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "network",
      });
    }
  }

  async function submitPaste(text: string) {
    if (!pasteTarget) return;
    const target = pasteTarget;
    setPasteTarget(null);
    updateOne(target.id, { status: "processing", error: undefined });
    try {
      const res = await fetch(`/api/sources/${target.id}/paste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title: target.title }),
      });
      const j = await res.json();
      if (!res.ok) {
        updateOne(target.id, { status: "failed", error: j.error ?? `HTTP ${res.status}` });
      } else {
        updateOne(target.id, { status: "ready" });
      }
    } catch (err) {
      updateOne(target.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "network",
      });
    }
  }

  const grouped = groupByTier(candidates);

  const processedCount = processing.filter((p) => p.status === "ready" || p.status === "failed").length;
  const readyCount = processing.filter((p) => p.status === "ready").length;
  const failedCount = processing.filter((p) => p.status === "failed").length;
  const allFinished = processing.length > 0 && processedCount === processing.length;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI 推荐阅读
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          为「{name}」挑一批入门材料
        </h1>
        {thesis ? <p className="mt-2 text-sm text-muted-foreground">{thesis}</p> : null}
      </div>

      {phase === "idle" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="text-4xl">🧭</div>
            <div className="text-base font-medium">让 AI 帮你找 8-12 篇值得读的文章</div>
            <div className="max-w-md text-sm text-muted-foreground">
              AI 基于你的主题生成搜索 query、用 Brave 搜真实链接，
              再分档筛选（必读 / 推荐 / 可选）。整个过程 30-60 秒。
            </div>
            <Button onClick={startRecommendation} className="mt-2">
              <Sparkles className="h-4 w-4" />
              开始推荐
            </Button>
            <Link
              href={`/app/atlases/${slug}`}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              跳过，直接进概览
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {phase === "drafting" ? (
        <ProgressPanel step="AI 在思考搜索策略..." hint="基于主题拟 3-5 个 query" />
      ) : null}

      {phase === "searching" ? (
        <div className="animate-fade-in">
          <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
            AI 想到的搜索 query
          </div>
          <div className="mb-6 flex flex-wrap gap-2">
            {queries.map((q, i) => (
              <span
                key={q}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  i === activeQueryIdx
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                {i === activeQueryIdx ? (
                  <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />
                ) : null}
                {q}
              </span>
            ))}
          </div>
          <ProgressPanel
            step="正在 Brave 搜索 + 筛选..."
            hint={`约 ${queries.length * 6}s；完成后按 必读 / 推荐 / 可选 分档`}
          />
        </div>
      ) : null}

      {phase === "picking" && candidates.length > 0 ? (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-lg border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">{candidates.length}</span>
                <span className="text-muted-foreground"> 条候选 · 已选 </span>
                <span className="font-medium text-primary">{selected.size}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelected(
                      selected.size === candidates.length
                        ? new Set()
                        : new Set(candidates.map((c) => c.url))
                    )
                  }
                >
                  {selected.size === candidates.length ? "全不选" : "全选"}
                </Button>
                <Button onClick={acceptAndProcess} disabled={selected.size === 0}>
                  加入 {selected.size} 条
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {queries.map((q) => (
                <Badge key={q} variant="outline">
                  {q}
                </Badge>
              ))}
            </div>
          </div>

          {(["top", "recommended", "further"] as Tier[]).map((tier) => {
            const items = grouped[tier];
            if (!items.length) return null;
            const meta = TIER_META[tier];
            return (
              <section key={tier}>
                <div className={cn("mb-2 flex items-baseline gap-2", meta.color)}>
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="text-xs text-muted-foreground">· {meta.desc}</span>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </div>
                <div className="space-y-2">
                  {items.map((c, idx) => (
                    <CandidateCard
                      key={c.url}
                      c={c}
                      checked={selected.has(c.url)}
                      onToggle={() => toggle(c.url)}
                      delay={idx * 50}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {phase === "processing" || phase === "done" ? (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-lg border border-border/60 bg-card/40 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {allFinished
                    ? `全部完成 · 成功 ${readyCount} / 失败 ${failedCount}`
                    : `正在抓取 ${processedCount} / ${processing.length}`}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  每条 5-15 秒 · 最多 {CONCURRENCY} 条并发
                </div>
              </div>
              {allFinished ? (
                <Button
                  onClick={() => {
                    router.push(`/app/atlases/${slug}/reading`);
                    router.refresh();
                  }}
                >
                  去看 Sources →
                </Button>
              ) : null}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${(processedCount / Math.max(1, processing.length)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            {processing.map((p) => (
              <ProcessingItem
                key={p.id}
                item={p}
                onRetry={() => retryOne(p)}
                onPaste={() => setPasteTarget(p)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {error && phase === "error" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={startRecommendation}>
              重试
            </Button>
          </div>
        </div>
      ) : null}

      {pasteTarget ? (
        <PasteModal
          source={pasteTarget}
          onCancel={() => setPasteTarget(null)}
          onSubmit={submitPaste}
        />
      ) : null}
    </div>
  );
}

async function processPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function ProgressPanel({ step, hint }: { step: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6 animate-fade-in">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <div className="text-sm font-medium">{step}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CandidateCard({
  c,
  checked,
  onToggle,
  delay,
}: {
  c: Candidate;
  checked: boolean;
  onToggle: () => void;
  delay: number;
}) {
  return (
    <Card
      className={cn(
        "transition-colors animate-fade-in",
        checked ? "border-primary/60 bg-primary/5" : "hover:border-border"
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <CardContent className="p-4">
        <label className="flex gap-3 cursor-pointer">
          <div
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
              checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
            )}
            onClick={(e) => {
              e.preventDefault();
              onToggle();
            }}
          >
            {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </div>
          <input type="checkbox" className="hidden" checked={checked} onChange={onToggle} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm font-medium text-foreground hover:text-primary"
                onClick={(e) => e.stopPropagation()}
              >
                {c.title}
              </a>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.url}</div>
            {c.why_relevant ? (
              <div className="mt-2 rounded bg-primary/10 px-2 py-1 text-xs text-primary/90">
                💡 {c.why_relevant}
              </div>
            ) : null}
            {c.snippet ? (
              <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.snippet}</div>
            ) : null}
          </div>
        </label>
      </CardContent>
    </Card>
  );
}

function ProcessingItem({
  item,
  onRetry,
  onPaste,
}: {
  item: ProcessingSource;
  onRetry: () => void;
  onPaste: () => void;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card/30 p-3">
      <div className="flex items-start gap-3">
        <StatusDot status={item.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.title}</div>
          {item.url ? (
            <div className="truncate text-[11px] text-muted-foreground">{item.url}</div>
          ) : null}
          {item.status === "failed" && item.error ? (
            <div className="mt-1 text-[11px] text-destructive">{item.error.slice(0, 160)}</div>
          ) : null}
        </div>
        {item.status === "failed" ? (
          <div className="flex gap-1">
            <button
              onClick={onRetry}
              className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:border-foreground/40"
            >
              重试
            </button>
            <button
              onClick={onPaste}
              className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20"
            >
              <Edit3 className="h-3 w-3" />
              粘贴正文
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ProcessingSource["status"] }) {
  if (status === "pending")
    return <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />;
  if (status === "processing")
    return <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />;
  if (status === "ready")
    return (
      <div className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </div>
    );
  return (
    <div className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive">
      <AlertTriangle className="h-2.5 w-2.5" />
    </div>
  );
}

function PasteModal({
  source,
  onCancel,
  onSubmit,
}: {
  source: ProcessingSource;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = React.useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">粘贴正文</div>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{source.title}</div>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            打开原文 <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <Textarea
          rows={10}
          className="mt-4"
          placeholder="把原文粘贴到这里（至少 20 字）..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={() => onSubmit(text)} disabled={text.trim().length < 20}>
            保存并生成摘要
          </Button>
        </div>
      </div>
    </div>
  );
}

function groupByTier(items: Candidate[]): Record<Tier, Candidate[]> {
  const out: Record<Tier, Candidate[]> = { top: [], recommended: [], further: [] };
  for (const item of items) out[item.tier].push(item);
  return out;
}
