"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Flashcard, ReviewRating } from "@/lib/types";

type CardWithAtlas = Flashcard & { atlas?: { slug: string; name: string } | null };

export function ReviewSession({ initial }: { initial: CardWithAtlas[] }) {
  const router = useRouter();
  const [queue, setQueue] = React.useState<CardWithAtlas[]>(initial);
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  if (queue.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <div className="text-4xl">✨</div>
        <div className="mt-4 text-base font-medium">没有待复习的卡片</div>
        <div className="mt-1 text-sm text-muted-foreground">
          去 Journal 多写几条吧，AI 今晚会提炼。
        </div>
      </div>
    );
  }

  if (index >= queue.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <div className="text-4xl">🎯</div>
        <div className="mt-4 text-base font-medium">今天全部复习完成</div>
        <Button variant="outline" className="mt-6" onClick={() => router.refresh()}>
          再来一轮
        </Button>
      </div>
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

      <div className="mt-6 text-center text-xs text-muted-foreground">
        ease {card.ease.toFixed(2)} · interval {card.interval_days}d · maturity {card.maturity}/10
      </div>
    </div>
  );
}
