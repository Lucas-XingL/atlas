"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Loader2, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Phase = "idle" | "running" | "done" | "error";

export function PathNewClient({
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
  const [error, setError] = React.useState<string | null>(null);
  const [hintIdx, setHintIdx] = React.useState(0);

  const hints = [
    "判定知识领域...",
    "拟定学习阶段...",
    "为每个阶段挑选资源...",
    "分档（必读 / 拓展）...",
    "最后检查...",
  ];

  React.useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setHintIdx((i) => (i + 1) % hints.length), 3000);
    return () => clearInterval(t);
  }, [phase]);

  async function start() {
    setPhase("running");
    setError(null);
    try {
      const res = await fetch(`/api/atlases/${slug}/path/generate`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "generate failed");
      setPhase("done");
      setTimeout(() => {
        router.push(`/app/atlases/${slug}/recommendations?tab=plan`);
        router.refresh();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
      setPhase("error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-14 space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <MapIcon className="h-3.5 w-3.5 text-primary" />
          学习路径
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          为「{name}」规划一条入门 → 进阶路径
        </h1>
        {thesis ? <p className="mt-2 text-sm text-muted-foreground">{thesis}</p> : null}
      </div>

      {phase === "idle" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="text-4xl">🧭</div>
            <div className="text-base font-medium">AI 会基于你的主题规划 3-6 个阶段</div>
            <div className="max-w-md text-sm leading-relaxed text-muted-foreground">
              每阶段给 3-6 个资源，分{" "}
              <span className="font-medium text-primary">必读</span> 和{" "}
              <span className="font-medium">拓展</span>。
              资源可以是文章、PDF、视频、播客或实体书。整个过程 30-60 秒。
            </div>
            <Button onClick={start} className="mt-2">
              <Sparkles className="h-4 w-4" />
              开始生成
            </Button>
            <Link
              href={`/app/atlases/${slug}`}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              跳过，稍后再生成
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {phase === "running" ? (
        <Card>
          <CardContent className="flex items-center gap-4 p-6 animate-fade-in">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <div className="text-sm font-medium">{hints[hintIdx]}</div>
              <div className="text-xs text-muted-foreground">大约 30-60 秒</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase === "done" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center animate-fade-in">
            <div className="text-4xl">✨</div>
            <div className="text-base font-medium">生成完成，跳转中...</div>
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
