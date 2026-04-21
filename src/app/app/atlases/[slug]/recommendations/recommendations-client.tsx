"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Radio,
  PenLine,
  Loader2,
  Plus,
  ExternalLink,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelative } from "@/lib/utils";
import type { ManualCandidate, PathResource, SubscriptionItem } from "@/lib/types";

type PathCandidate = PathResource & {
  stage: { id: string; name: string; stage_order: number; intent: string | null } | null;
};

interface Recs {
  path: PathCandidate[];
  subscription: Array<SubscriptionItem & { subscription: { id: string; title: string; site_url: string | null } | null }>;
  manual: ManualCandidate[];
}

export function RecommendationsClient({
  slug,
  atlasName,
}: {
  slug: string;
  atlasName: string;
}) {
  const router = useRouter();
  const [recs, setRecs] = React.useState<Recs | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/atlases/${slug}/recommendations`);
      const j = await res.json();
      if (res.ok) setRecs(j);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function accept(origin: "path" | "subscription" | "manual", refId: string) {
    setAcceptingId(refId);
    try {
      const res = await fetch("/api/recommendations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, ref_id: refId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`入池失败: ${j.error ?? res.status}`);
      }
      await load();
    } finally {
      setAcceptingId(null);
    }
  }

  async function skipPath(id: string) {
    setAcceptingId(id);
    try {
      await fetch(`/api/path-resources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_status: "skipped" }),
      });
      await load();
    } finally {
      setAcceptingId(null);
    }
  }

  async function skipSubItem(id: string) {
    setAcceptingId(id);
    try {
      await fetch(`/api/subscription-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_status: "skipped" }),
      });
      await load();
    } finally {
      setAcceptingId(null);
    }
  }

  async function deleteManual(id: string) {
    setAcceptingId(id);
    try {
      await fetch(`/api/manual-candidates/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setAcceptingId(null);
    }
  }

  const totalCount =
    (recs?.path.length ?? 0) +
    (recs?.subscription.length ?? 0) +
    (recs?.manual.length ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">内容推荐</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          共 {totalCount} 条候选 · 点「入池」后进阅读清单
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">加载中...</span>
          </CardContent>
        </Card>
      ) : !recs ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          加载失败
        </div>
      ) : (
        <>
          {/* Section: learning path candidates */}
          <Section
            icon={<BookOpen className="h-4 w-4 text-primary" />}
            title="学习计划"
            count={recs.path.length}
            subtitle="来自 AI 规划的学习路径，按阶段组织"
            footerLink={{
              href: `/app/atlases/${slug}/path`,
              label: "查看完整路径 →",
            }}
          >
            {recs.path.length === 0 ? (
              <Empty text="所有学习计划资源都已处理" />
            ) : (
              <PathCandidates
                items={recs.path}
                acceptingId={acceptingId}
                onAccept={(id) => accept("path", id)}
                onSkip={skipPath}
              />
            )}
          </Section>

          {/* Section: subscription candidates */}
          <Section
            icon={<Radio className="h-4 w-4 text-emerald-400" />}
            title="每日订阅"
            count={recs.subscription.length}
            subtitle="你订阅的 RSS feed 抓来的新 item"
            footerLink={{
              href: `/app/atlases/${slug}/subscriptions`,
              label: "管理订阅 →",
            }}
          >
            {recs.subscription.length === 0 ? (
              <Empty text="订阅功能即将上线 · 点「管理订阅」添加 RSS feed" />
            ) : (
              <SubscriptionCandidates
                items={recs.subscription as any}
                acceptingId={acceptingId}
                onAccept={(id) => accept("subscription", id)}
                onSkip={skipSubItem}
              />
            )}
          </Section>

          {/* Section: manual candidates */}
          <Section
            icon={<PenLine className="h-4 w-4 text-amber-400" />}
            title="可能会看"
            count={recs.manual.length}
            subtitle="手动贴的链接或文本草稿"
          >
            <ManualAdd slug={slug} onAdded={load} />
            {recs.manual.length === 0 ? null : (
              <ManualCandidates
                items={recs.manual}
                acceptingId={acceptingId}
                onAccept={(id) => accept("manual", id)}
                onDelete={deleteManual}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  subtitle,
  footerLink,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  subtitle?: string;
  footerLink?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-base font-semibold">{title}</h2>
            <Badge variant="outline">{count}</Badge>
          </div>
          {subtitle ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {footerLink ? (
          <Link
            href={footerLink.href}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {footerLink.label}
          </Link>
        ) : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function PathCandidates({
  items,
  acceptingId,
  onAccept,
  onSkip,
}: {
  items: PathCandidate[];
  acceptingId: string | null;
  onAccept: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  // Group by stage
  const byStage = new Map<string, PathCandidate[]>();
  for (const r of items) {
    const key = r.stage?.id ?? "_";
    const arr = byStage.get(key) ?? [];
    arr.push(r);
    byStage.set(key, arr);
  }
  const stages = Array.from(byStage.entries()).sort(
    (a, b) => (a[1][0]?.stage?.stage_order ?? 0) - (b[1][0]?.stage?.stage_order ?? 0)
  );

  return (
    <div className="space-y-3">
      {stages.map(([stageId, resources]) => {
        const stage = resources[0]?.stage;
        return (
          <div key={stageId} className="rounded-md border border-border/60 bg-card/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <Badge variant="outline">阶段 {(stage?.stage_order ?? 0) + 1}</Badge>
              <span className="font-medium">{stage?.name ?? "未归类"}</span>
            </div>
            <div className="space-y-1.5">
              {resources.map((r) => (
                <CandidateRow
                  key={r.id}
                  title={r.title}
                  subtitle={r.author ?? undefined}
                  note={r.why_relevant ?? undefined}
                  url={r.url ?? undefined}
                  tierBadge={r.tier === "core" ? "必读" : "拓展"}
                  typeBadge={
                    r.resource_type === "physical"
                      ? "实体书"
                      : r.resource_type === "external"
                        ? "外部"
                        : "在线"
                  }
                  searchHint={r.search_hint ?? undefined}
                  busy={acceptingId === r.id}
                  onAccept={() => onAccept(r.id)}
                  onSkip={() => onSkip(r.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SubscriptionCandidates({
  items,
  acceptingId,
  onAccept,
  onSkip,
}: {
  items: Array<SubscriptionItem & { subscription: { id: string; title: string } | null }>;
  acceptingId: string | null;
  onAccept: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <CandidateRow
          key={it.id}
          title={it.title}
          subtitle={
            (it.subscription?.title ? `来自：${it.subscription.title}` : null) ??
            (it.author ?? undefined)
          }
          note={it.summary_preview ?? undefined}
          url={it.url ?? undefined}
          typeBadge={it.published_at ? formatRelative(it.published_at) : "订阅"}
          busy={acceptingId === it.id}
          onAccept={() => onAccept(it.id)}
          onSkip={() => onSkip(it.id)}
        />
      ))}
    </div>
  );
}

function ManualAdd({ slug, onAdded }: { slug: string; onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"url" | "text">("url");
  const [url, setUrl] = React.useState("");
  const [text, setText] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      const body =
        mode === "url"
          ? { url, title: title || undefined }
          : { text_snippet: text, title: title || undefined };
      const res = await fetch(`/api/atlases/${slug}/manual-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setUrl("");
        setText("");
        setTitle("");
        setOpen(false);
        onAdded();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(`添加失败: ${j.error}`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-border bg-card/20 p-3 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        添加链接或粘贴文本
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card/40 p-4">
      <div className="mb-3 flex gap-4 text-sm">
        <button
          onClick={() => setMode("url")}
          className={mode === "url" ? "font-medium text-foreground" : "text-muted-foreground"}
        >
          URL
        </button>
        <button
          onClick={() => setMode("text")}
          className={mode === "text" ? "font-medium text-foreground" : "text-muted-foreground"}
        >
          粘贴文本
        </button>
        <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2">
        <Input
          placeholder="标题（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {mode === "url" ? (
          <Input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        ) : (
          <Textarea
            rows={5}
            placeholder="粘贴正文或要点（≥20 字）..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <Button
          size="sm"
          onClick={submit}
          disabled={busy || (mode === "url" ? !url : text.trim().length < 20)}
        >
          {busy ? "添加中..." : "添加到候选"}
        </Button>
      </div>
    </div>
  );
}

function ManualCandidates({
  items,
  acceptingId,
  onAccept,
  onDelete,
}: {
  items: ManualCandidate[];
  acceptingId: string | null;
  onAccept: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((c) => (
        <CandidateRow
          key={c.id}
          title={c.title}
          subtitle={c.url ? "URL" : "文本片段"}
          note={c.note ?? undefined}
          url={c.url ?? undefined}
          typeBadge={formatRelative(c.created_at)}
          busy={acceptingId === c.id}
          onAccept={() => onAccept(c.id)}
          onSkip={() => onDelete(c.id)}
          skipLabel="删除"
        />
      ))}
    </div>
  );
}

function CandidateRow({
  title,
  subtitle,
  note,
  url,
  tierBadge,
  typeBadge,
  searchHint,
  busy,
  onAccept,
  onSkip,
  skipLabel = "跳过",
}: {
  title: string;
  subtitle?: string;
  note?: string;
  url?: string;
  tierBadge?: string;
  typeBadge?: string;
  searchHint?: string;
  busy: boolean;
  onAccept: () => void;
  onSkip: () => void;
  skipLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/60 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {tierBadge ? (
            <span
              className={cn(
                "rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium",
                tierBadge === "必读" ? "text-primary" : "text-muted-foreground"
              )}
            >
              {tierBadge}
            </span>
          ) : null}
          {typeBadge ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {typeBadge}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-sm font-medium">{title}</div>
        {subtitle ? (
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        ) : null}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
          >
            {url}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : null}
        {note ? (
          <div className="mt-1.5 rounded bg-primary/10 px-2 py-1 text-xs text-primary/90">
            💡 {note}
          </div>
        ) : null}
        {searchHint ? (
          <div className="mt-1 text-[11px] text-muted-foreground">
            🔍 {searchHint}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={onAccept} disabled={busy}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Check className="h-3 w-3" />
              入池
            </>
          )}
        </Button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
}
