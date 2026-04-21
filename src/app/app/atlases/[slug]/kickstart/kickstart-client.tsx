"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ExternalLink, Loader2 } from "lucide-react";

interface Candidate {
  title: string;
  url: string;
  snippet: string;
  why_relevant: string;
  source_query: string;
}

type Phase = "idle" | "running" | "picking" | "accepting" | "done" | "error";

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
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  async function runSearch() {
    setPhase("running");
    setError(null);
    try {
      const res = await fetch(`/api/atlases/${slug}/kickstart`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kickstart failed");
      setQueries(json.queries ?? []);
      setCandidates(json.candidates ?? []);
      // Pre-select all by default
      setSelected(new Set((json.candidates ?? []).map((c: Candidate) => c.url)));
      setPhase("picking");
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "accept failed");
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
            <div className="text-base font-medium">让 AI 帮你找 6-12 篇值得读的文章</div>
            <div className="max-w-md text-sm text-muted-foreground">
              AI 会基于你的 thesis 生成几个搜索关键词，用 Brave 搜真实 URL，
              再筛选出最相关的。整个过程大约 30-60 秒。
            </div>
            <Button onClick={runSearch} className="mt-2">
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

      {phase === "running" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm text-muted-foreground">
              AI 正在生成 query、搜索、筛选...（30-60 秒）
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase === "picking" || phase === "accepting" ? (
        <div className="space-y-6">
          {queries.length > 0 ? (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                AI 使用的搜索 query
              </div>
              <div className="flex flex-wrap gap-2">
                {queries.map((q) => (
                  <Badge key={q} variant="outline">
                    {q}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                候选 {candidates.length} 条 · 已选 {selected.size}
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

            <div className="space-y-3">
              {candidates.map((c) => {
                const checked = selected.has(c.url);
                return (
                  <Card
                    key={c.url}
                    className={
                      checked
                        ? "border-primary/60 bg-primary/5"
                        : "hover:border-border"
                    }
                  >
                    <CardContent className="p-4">
                      <label className="flex gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(c.url)}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
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
              })}
            </div>
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="text-4xl">✨</div>
            <div className="text-base font-medium">已加入，正在后台抓取内容</div>
            <div className="text-xs text-muted-foreground">
              跳转到 Sources...
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error && phase !== "idle" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          {phase === "error" ? (
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => setPhase("idle")}>
                重试
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
