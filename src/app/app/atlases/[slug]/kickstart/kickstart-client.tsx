"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ExternalLink, Loader2, Check } from "lucide-react";
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

type Phase =
  | "idle"
  | "drafting" // LLM generating queries
  | "searching" // Brave searching + LLM ranking
  | "picking"
  | "accepting"
  | "done"
  | "error";

const TIER_META: Record<Tier, { label: string; desc: string; color: string }> = {
  top: {
    label: "Top Picks",
    desc: "灯塔级，必读",
    color: "text-primary",
  },
  recommended: {
    label: "Recommended",
    desc: "重要参考",
    color: "text-foreground/90",
  },
  further: {
    label: "Further Reading",
    desc: "可选补充",
    color: "text-muted-foreground",
  },
};

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
  const [error, setError] = React.useState<string | null>(null);

  async function start() {
    setError(null);
    setQueries([]);
    setCandidates([]);
    setSelected(new Set());
    setActiveQueryIdx(0);
    setPhase("drafting");

    try {
      // Step 1 — queries (fast)
      const r1 = await fetch(`/api/atlases/${slug}/kickstart/queries`, { method: "POST" });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error ?? "draft queries failed");
      setQueries(j1.queries ?? []);
      setPhase("searching");

      // Cycle the "active query" indicator while the backend works
      const qs: string[] = j1.queries ?? [];
      const ticker = setInterval(() => {
        setActiveQueryIdx((i) => (i + 1) % Math.max(1, qs.length));
      }, 2400);

      try {
        // Step 2 — search + rank (slow)
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

  async function accept() {
    const picks = candidates.filter((c) => selected.has(c.url));
    if (picks.length === 0) {
      setError("请至少选一条");
      return;
    }
    setPhase("accepting");
    setError(null);
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
      setPhase("done");
      setTimeout(() => {
        router.push(`/app/atlases/${slug}/sources`);
        router.refresh();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "accept failed");
      setPhase("error");
    }
  }

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  const grouped = groupByTier(candidates);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Reading Kickstart
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          为「{name}」挑一批入门材料
        </h1>
        {thesis ? (
          <p className="mt-2 text-sm text-muted-foreground">{thesis}</p>
        ) : null}
      </div>

      {phase === "idle" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="text-4xl">🧭</div>
            <div className="text-base font-medium">让 AI 帮你找 8-12 篇值得读的文章</div>
            <div className="max-w-md text-sm text-muted-foreground">
              AI 会基于你的 thesis 生成几个搜索 query、用 Brave 搜真实 URL、
              再分档筛选（Top / Recommended / Further Reading）。整个过程 30-60 秒。
            </div>
            <Button onClick={start} className="mt-2">
              <Sparkles className="h-4 w-4" />
              开始推荐
            </Button>
            <Link
              href={`/app/atlases/${slug}`}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              跳过，直接进 Dashboard
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {phase === "drafting" ? (
        <ProgressPanel
          step="AI 在思考搜索策略..."
          hint="基于你的 thesis 拟 3-5 个 query"
        />
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
            hint={`大约 ${queries.length * 6}s；完成后会按 Top / Recommended / Further 分档`}
          />
        </div>
      ) : null}

      {(phase === "picking" || phase === "accepting") && candidates.length > 0 ? (
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
                  disabled={phase === "accepting"}
                >
                  {selected.size === candidates.length ? "全不选" : "全选"}
                </Button>
                <Button
                  onClick={accept}
                  disabled={phase === "accepting" || selected.size === 0}
                >
                  {phase === "accepting" ? "入库中..." : `加入 ${selected.size} 条`}
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

      {phase === "done" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center animate-fade-in">
            <div className="text-4xl">✨</div>
            <div className="text-base font-medium">已加入，正在后台抓取内容</div>
            <div className="text-xs text-muted-foreground">跳转到 Sources...</div>
          </CardContent>
        </Card>
      ) : null}

      {error && phase === "error" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={start}>
              重试
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
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
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {c.url}
            </div>
            {c.why_relevant ? (
              <div className="mt-2 rounded bg-primary/10 px-2 py-1 text-xs text-primary/90">
                💡 {c.why_relevant}
              </div>
            ) : null}
            {c.snippet ? (
              <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                {c.snippet}
              </div>
            ) : null}
          </div>
        </label>
      </CardContent>
    </Card>
  );
}

function groupByTier(items: Candidate[]): Record<Tier, Candidate[]> {
  const out: Record<Tier, Candidate[]> = { top: [], recommended: [], further: [] };
  for (const item of items) out[item.tier].push(item);
  return out;
}
