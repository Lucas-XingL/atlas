"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, ExternalLink, Loader2, Trash2, Search, Play, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfUploadDialog } from "@/components/pdf-upload-dialog";
import { StageRegenerateDialog } from "@/components/stage-regenerate-dialog";
import type {
  LearningPath,
  PathResource,
  PathResourceUserStatus,
  PathStage,
  ResourceType,
} from "@/lib/types";

const TYPE_META: Record<ResourceType, { label: string; icon: React.ReactNode }> = {
  consumable: { label: "可在线读", icon: <BookOpen className="h-3 w-3" /> },
  external: { label: "需外部看", icon: <ExternalLink className="h-3 w-3" /> },
  physical: { label: "实体书", icon: <BookOpen className="h-3 w-3" /> },
};

const STATUS_META: Record<PathResourceUserStatus, { label: string; tone: string }> = {
  suggested: { label: "待开始", tone: "text-muted-foreground" },
  accepted: { label: "待开始", tone: "text-muted-foreground" },
  reading: { label: "读中", tone: "text-primary" },
  finished: { label: "已读完", tone: "text-emerald-400" },
  skipped: { label: "已跳过", tone: "text-muted-foreground/60" },
};

const STATUS_CHOICES: { value: PathResourceUserStatus; label: string }[] = [
  { value: "suggested", label: "待开始" },
  { value: "reading", label: "读中" },
  { value: "finished", label: "已读完" },
  { value: "skipped", label: "已跳过" },
];

export function PathClient({
  slug,
  atlasName,
  path,
}: {
  slug: string;
  atlasName: string;
  path: LearningPath;
}) {
  const router = useRouter();
  const [regenerating, setRegenerating] = React.useState(false);

  async function regenerate() {
    if (!confirm("重新生成会保留当前路径为历史版本。继续？")) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/atlases/${slug}/path/generate`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`重新生成失败: ${j.error ?? res.status}`);
      } else {
        router.refresh();
      }
    } finally {
      setRegenerating(false);
    }
  }

  const totalCore = path.stages.reduce(
    (acc, s) => acc + s.resources.filter((r) => r.tier === "core").length,
    0
  );
  const finishedCore = path.stages.reduce(
    (acc, s) =>
      acc +
      s.resources.filter((r) => r.tier === "core" && r.user_status === "finished").length,
    0
  );
  const progressPct = totalCore === 0 ? 0 : Math.round((finishedCore / totalCore) * 100);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 space-y-6">
      {/* Overview */}
      <div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            学习路径 · 版本 v{path.version}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={regenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                生成中...
              </>
            ) : (
              "重新生成"
            )}
          </Button>
        </div>
        {path.overview ? (
          <p className="mt-3 text-sm leading-relaxed text-foreground/90">{path.overview}</p>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {finishedCore} / {totalCore} 必读完成
          </span>
        </div>
      </div>

      {/* Stages */}
      {path.stages.map((stage) => (
        <StageBlock
          key={stage.id}
          stage={stage}
          slug={slug}
          onChange={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function StageBlock({
  stage,
  slug,
  onChange,
}: {
  stage: PathStage;
  slug: string;
  onChange: () => void;
}) {
  const core = stage.resources.filter((r) => r.tier === "core");
  const extra = stage.resources.filter((r) => r.tier === "extra");
  const coreFinished = core.filter((r) => r.user_status === "finished").length;
  const stagePct = core.length === 0 ? 0 : Math.round((coreFinished / core.length) * 100);
  const [regenOpen, setRegenOpen] = React.useState(false);

  async function remove() {
    if (!confirm(`删除阶段「${stage.name}」？其中的资源会一起删除。`)) return;
    await fetch(`/api/path-stages/${stage.id}`, { method: "DELETE" });
    onChange();
  }

  async function regenerate(feedback: string) {
    const res = await fetch(`/api/path-stages/${stage.id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedback ? { feedback } : {}),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `HTTP ${res.status}`);
    }
    setRegenOpen(false);
    onChange();
  }

  return (
    <section className="rounded-lg border border-border/60 bg-card/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
              阶段 {stage.stage_order + 1}
            </span>
            <h3 className="text-base font-semibold">{stage.name}</h3>
            {stage.est_duration ? (
              <Badge variant="outline">{stage.est_duration}</Badge>
            ) : null}
          </div>
          {stage.intent ? (
            <p className="mt-1.5 text-sm text-muted-foreground">{stage.intent}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 max-w-48">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${stagePct}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {coreFinished}/{core.length} 必读
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setRegenOpen(true)}
            className="text-muted-foreground hover:text-primary"
            aria-label="重新生成此阶段"
            title="重新生成此阶段"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <button
            onClick={remove}
            className="text-muted-foreground hover:text-destructive"
            aria-label="删除阶段"
            title="删除阶段"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {core.length > 0 ? (
          <>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              必读 ({core.length})
            </div>
            {core.map((r) => (
              <ResourceRow key={r.id} resource={r} slug={slug} onChange={onChange} />
            ))}
          </>
        ) : null}

        {extra.length > 0 ? (
          <>
            <div className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              拓展 ({extra.length})
            </div>
            {extra.map((r) => (
              <ResourceRow key={r.id} resource={r} slug={slug} onChange={onChange} />
            ))}
          </>
        ) : null}
      </div>
      <StageRegenerateDialog
        open={regenOpen}
        stageName={stage.name}
        onClose={() => setRegenOpen(false)}
        onSubmit={regenerate}
      />
    </section>
  );
}

function ResourceRow({
  resource: r,
  slug,
  onChange,
}: {
  resource: PathResource;
  slug: string;
  onChange: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [pdfOpen, setPdfOpen] = React.useState(false);
  const typeMeta = TYPE_META[r.resource_type];
  const statusMeta = STATUS_META[r.user_status];

  // For physical (books), we open a PDF upload dialog instead of the default accept
  async function acceptAndReturnSourceId(): Promise<string> {
    const res = await fetch(`/api/path-resources/${r.id}/accept`, { method: "POST" });
    const j = await res.json();
    if (!res.ok || !j.source_id) throw new Error(j.error ?? "创建 source 失败");
    return j.source_id as string;
  }

  async function accept() {
    if (r.resource_type === "physical") {
      setPdfOpen(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/path-resources/${r.id}/accept`, { method: "POST" });
      const j = await res.json();
      if (res.ok && j.source_id) {
        window.location.href = `/app/atlases/${slug}/reading`;
      } else {
        alert(`开始失败: ${j.error ?? "未知错误"}`);
        onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(next: PathResourceUserStatus) {
    if (next === r.user_status) return;
    setBusy(true);
    try {
      await fetch(`/api/path-resources/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_status: next }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`删除「${r.title}」？`)) return;
    setBusy(true);
    try {
      await fetch(`/api/path-resources/${r.id}`, { method: "DELETE" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const isFinished = r.user_status === "finished";
  const isSkipped = r.user_status === "skipped";

  return (
    <>
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 transition-colors",
        isFinished
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isSkipped
            ? "border-border/40 bg-background/40 opacity-60"
            : "border-border bg-background/60 hover:border-border/80"
      )}
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {isFinished ? (
          <Check className="h-4 w-4 text-emerald-400" strokeWidth={3} />
        ) : (
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              r.user_status === "reading" ? "bg-primary" : "bg-muted-foreground/40"
            )}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-medium", isSkipped && "line-through")}>
            {r.title}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {typeMeta.icon}
            {typeMeta.label}
          </span>
          <span className={cn("text-[11px]", statusMeta.tone)}>· {statusMeta.label}</span>
        </div>
        {r.author ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{r.author}</div>
        ) : null}
        {r.why_relevant ? (
          <div className="mt-1.5 text-xs text-muted-foreground">💡 {r.why_relevant}</div>
        ) : null}
        {!r.url && r.search_hint ? (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Search className="h-3 w-3" /> {r.search_hint}
          </div>
        ) : null}
        {r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-[11px] text-primary hover:underline"
          >
            {r.url}
          </a>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {!r.source_id && !isFinished && !isSkipped ? (
          <Button size="sm" onClick={accept} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Play className="h-3 w-3" />
                开始读
              </>
            )}
          </Button>
        ) : null}
        {r.source_id ? (
          <a
            href={`/app/atlases/${slug}/reading`}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] hover:border-foreground/40"
          >
            查看
          </a>
        ) : null}
        <select
          value={r.user_status === "accepted" ? "suggested" : r.user_status}
          onChange={(e) => updateStatus(e.target.value as PathResourceUserStatus)}
          disabled={busy}
          className="rounded border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground hover:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="修改状态"
        >
          {STATUS_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={remove}
          disabled={busy}
          className="text-[11px] text-muted-foreground hover:text-destructive"
        >
          删除
        </button>
      </div>
    </div>
    {r.resource_type === "physical" ? (
      <PdfUploadDialog
        open={pdfOpen}
        resourceTitle={r.title}
        onClose={() => setPdfOpen(false)}
        createSource={acceptAndReturnSourceId}
        onIngested={() => {
          setPdfOpen(false);
          window.location.href = `/app/atlases/${slug}/reading`;
        }}
      />
    ) : null}
    </>
  );
}
