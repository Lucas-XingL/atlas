"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Radio, Plus, ExternalLink, Trash2, RefreshCw, Pause, Play, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelative } from "@/lib/utils";
import type { Subscription, SubscriptionItem } from "@/lib/types";

type ItemWithSub = SubscriptionItem & {
  subscription?: { title: string; site_url: string | null };
};

export function SubscriptionSection({
  slug,
  subscriptions,
  items,
}: {
  slug: string;
  subscriptions: Subscription[];
  items: ItemWithSub[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function accept(id: string) {
    setBusyId(id);
    try {
      await fetch("/api/recommendations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "subscription", ref_id: id }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function skip(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/subscription-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_status: "skipped" }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SubscriptionManager slug={slug} subscriptions={subscriptions} />

      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">新 item</h3>
          <span className="text-xs text-muted-foreground">
            {items.length} 条待处理
          </span>
        </div>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            {subscriptions.length === 0
              ? "添加一个 RSS feed 订阅后，新 item 会自动出现在这里"
              : "暂无新 item · 下次抓取由 cron 自动触发"}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <SubItemCard
                key={it.id}
                item={it}
                busy={busyId === it.id}
                onAccept={() => accept(it.id)}
                onSkip={() => skip(it.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriptionManager({
  slug,
  subscriptions,
}: {
  slug: string;
  subscriptions: Subscription[];
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [feedUrl, setFeedUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function addSub() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/atlases/${slug}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feed_url: feedUrl }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "添加失败");
        return;
      }
      setFeedUrl("");
      setAdding(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function refresh(id: string) {
    await fetch(`/api/subscriptions/${id}/refresh`, { method: "POST" });
    router.refresh();
  }

  async function toggleActive(sub: Subscription) {
    await fetch(`/api/subscriptions/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !sub.is_active }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("删除此订阅及其所有待处理 item？")) return;
    await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">
              订阅管理 · {subscriptions.length} 个
            </h3>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            粘 RSS feed URL 就能订阅。每 2 小时自动抓一次新 item。
          </div>
        </div>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            添加订阅
          </Button>
        ) : (
          <button
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {adding ? (
        <div className="mb-3 space-y-2 rounded-md border border-border bg-background/40 p-3">
          <Input
            type="url"
            placeholder="https://example.com/feed.xml"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              需要完整的 RSS/Atom feed URL（公众号可用 rsshub 等转换）
            </span>
            <Button
              size="sm"
              onClick={addSub}
              disabled={submitting || !feedUrl}
            >
              {submitting ? "校验中..." : "添加"}
            </Button>
          </div>
          {error ? (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      {subscriptions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          还没有订阅 · 上面添加第一条
        </div>
      ) : (
        <ul className="space-y-1.5">
          {subscriptions.map((s) => (
            <li
              key={s.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm",
                s.is_active ? "border-border bg-background/60" : "border-border/40 bg-muted/20 opacity-70"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{s.title}</span>
                  {!s.is_active ? <Badge variant="outline">已停用</Badge> : null}
                  {s.last_error ? (
                    <Badge variant="outline" className="text-destructive">
                      抓取失败
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {s.site_url ? (
                    <a
                      href={s.site_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 hover:text-foreground"
                    >
                      {new URL(s.site_url).hostname}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : null}
                  {s.last_fetched_at ? (
                    <span>最后抓取 {formatRelative(s.last_fetched_at)}</span>
                  ) : (
                    <span>尚未抓取</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <button
                  onClick={() => refresh(s.id)}
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                  title="立刻抓一次"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => toggleActive(s)}
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                  title={s.is_active ? "停用" : "启用"}
                >
                  {s.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="rounded p-1 hover:bg-muted hover:text-destructive"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubItemCard({
  item,
  busy,
  onAccept,
  onSkip,
}: {
  item: ItemWithSub;
  busy: boolean;
  onAccept: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/60 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {item.subscription?.title ? (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
              {item.subscription.title}
            </span>
          ) : null}
          {item.published_at ? (
            <span>{formatRelative(item.published_at)}</span>
          ) : null}
          {item.author ? <span>· {item.author}</span> : null}
        </div>
        <div className="mt-1 text-sm font-medium">{item.title}</div>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
          >
            {item.url}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : null}
        {item.summary_preview ? (
          <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {item.summary_preview}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={onAccept} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "入池"}
        </Button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          跳过
        </button>
      </div>
    </div>
  );
}
