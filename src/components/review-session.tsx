"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Flashcard, ReviewRating } from "@/lib/types";

type CardWithAtlas = Flashcard & { atlas?: { slug: string; name: string } | null };

interface ReviewStats {
  remembered: number;
  foggy: number;
  forgot: number;
}

export function ReviewSession({
  initial,
  backTo,
  nextDueAt,
}: {
  initial: CardWithAtlas[];
  backTo: string | null;
  nextDueAt: string | null;
}) {
  const router = useRouter();
  const [queue] = React.useState<CardWithAtlas[]>(initial);
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [stats, setStats] = React.useState<ReviewStats>({
    remembered: 0,
    foggy: 0,
    forgot: 0,
  });

  // The Atlas this review session came from (either via ?from= or the single
  // atlas referenced by the cards we reviewed).
  const primaryAtlas = React.useMemo(() => {
    const slugs = new Set(queue.map((c) => c.atlas?.slug).filter(Boolean) as string[]);
    if (slugs.size === 1) {
      const c = queue.find((c) => c.atlas?.slug);
      return c?.atlas ?? null;
    }
    return null;
  }, [queue]);

  const returnHref = React.useMemo(() => {
    if (backTo && backTo.startsWith("/app/")) return backTo;
    if (primaryAtlas?.slug) return `/app/atlases/${primaryAtlas.slug}`;
    return "/app";
  }, [backTo, primaryAtlas]);

  if (queue.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center">
          <div className="text-4xl">✨</div>
          <div className="mt-4 text-base font-medium">今天没有待复习的卡片</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {nextDueAt
              ? `下一次复习：${formatNextDue(nextDueAt)}`
              : "先去写几条随记，AI 今晚会提炼成卡片。"}
          </div>
          <Link href={returnHref}>
            <Button variant="outline" className="mt-6">
              返回{primaryAtlas ? ` ${primaryAtlas.name}` : " Atlas"}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (index >= queue.length) {
    const total = stats.remembered + stats.foggy + stats.forgot;
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <div className="text-4xl">🎯</div>
          <div className="mt-4 text-base font-medium">复习完成</div>
          <div className="mt-2 text-sm text-muted-foreground">
            本轮 {total} 张 · 记得 {stats.remembered} · 模糊 {stats.foggy} · 忘了 {stats.forgot}
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <Link href={returnHref}>
              <Button variant="outline">
                返回{primaryAtlas ? ` ${primaryAtlas.name}` : " Atlas"}
              </Button>
            </Link>
            {primaryAtlas ? (
              <Link href={`/app/atlases/${primaryAtlas.slug}/flashcards`}>
                <Button>看所有卡片</Button>
              </Link>
            ) : null}
          </div>

          <div className="mt-6 text-xs text-muted-foreground">
            下一次复习由 SM-2 自动安排 · 记得的卡片间隔会逐步拉长
          </div>
        </CardContent>
      </Card>
    );
  }

  const card = queue[index];

  async function rate(rating: ReviewRating) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/flashcards/${card.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      setStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
      setRevealed(false);
      setIndex((i) => i + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {index + 1} / {queue.length}
        </span>
        {card.atlas ? <Badge variant="outline">{card.atlas.name}</Badge> : null}
      </div>

      <Card className="min-h-[320px]">
        <CardContent className="flex min-h-[320px] flex-col p-8">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">问题</div>
            <div className="mt-3 whitespace-pre-wrap text-lg leading-relaxed">{card.front}</div>

            {revealed ? (
              <div className="mt-8 border-t border-border/60 pt-6">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">回答</div>
                <div className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-foreground/95">
                  {card.back}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-8">
            {!revealed ? (
              <Button onClick={() => setRevealed(true)} className="w-full">
                显示答案
              </Button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => rate("forgot")} disabled={submitting}>
                  忘了
                </Button>
                <Button variant="outline" onClick={() => rate("foggy")} disabled={submitting}>
                  模糊
                </Button>
                <Button onClick={() => rate("remembered")} disabled={submitting}>
                  记得
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          熟悉度 {card.maturity}/10 · 下次 {card.interval_days}d · 正确率{" "}
          {card.review_count > 0
            ? `${Math.round((card.success_count / card.review_count) * 100)}%`
            : "—"}
        </span>
        <Link href={returnHref} className="hover:text-foreground">
          退出复习 →
        </Link>
      </div>
    </div>
  );
}

function formatNextDue(iso: string): string {
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  if (ms < 0) return "刚刚";
  const hours = Math.floor(ms / 3600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))} 分钟后`;
  if (hours < 24) return `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "明天";
  if (days < 7) return `${days} 天后`;
  return d.toLocaleDateString("zh-CN");
}
