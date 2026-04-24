"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen,
  ExternalLink,
  Loader2,
  Trash2,
  Search,
  Play,
  Check,
  Sparkles,
  MoreHorizontal,
  Eye,
  RotateCcw,
  Undo2,
} from "lucide-react";
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
  accepted: { label: "待上传", tone: "text-amber-400" },
  reading: { label: "读中", tone: "text-primary" },
  finished: { label: "已读完", tone: "text-emerald-400" },
  skipped: { label: "已跳过", tone: "text-muted-foreground/60" },
};

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
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [pdfOpen, setPdfOpen] = React.useState(false);
  const typeMeta = TYPE_META[r.resource_type];
  const statusMeta = STATUS_META[r.user_status];
  // If user_status says reading/accepted but we have no source_id, the source
  // was deleted from the reading list; call that out so the label doesn't lie.
  const isOrphan =
    (r.user_status === "reading" || r.user_status === "accepted") && !r.source_id;
  const displayStatus = isOrphan
    ? { label: "source 已删", tone: "text-amber-400" }
    : statusMeta;

  async function acceptAndReturnSourceId(): Promise<string> {
    const res = await fetch(`/api/path-resources/${r.id}/accept`, { method: "POST" });
    const j = await res.json();
    if (!res.ok || !j.source_id) throw new Error(j.error ?? "创建 source 失败");
    return j.source_id as string;
  }

  async function startReading() {
    if (r.resource_type === "physical") {
      setPdfOpen(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/path-resources/${r.id}/accept`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.source_id) {
        alert(`开始失败: ${j.error ?? "未知错误"}`);
        onChange();
        return;
      }
      // Go straight into the reader — the page handles fetch_status=pending.
      router.push(`/app/atlases/${slug}/reading/${j.source_id}`);
    } finally {
      setBusy(false);
    }
  }

  async function viewInReader() {
    if (r.source_id) {
      router.push(`/app/atlases/${slug}/reading/${r.source_id}`);
    } else {
      router.push(`/app/atlases/${slug}/reading`);
    }
  }

  async function updateStatus(next: PathResourceUserStatus) {
    if (next === r.user_status) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/path-resources/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_status: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`更新状态失败: ${j.error ?? res.status}`);
      }
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
          <span className={cn("text-[11px]", displayStatus.tone)}>· {displayStatus.label}</span>
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

      <div className="flex shrink-0 items-center gap-1.5">
        <StatusActions
          resource={r}
          busy={busy}
          onStart={startReading}
          onView={viewInReader}
          onChangeStatus={updateStatus}
          onRemove={remove}
        />
      </div>
    </div>
    {r.resource_type === "physical" ? (
      <PdfUploadDialog
        open={pdfOpen}
        resourceTitle={r.title}
        onClose={() => setPdfOpen(false)}
        createSource={acceptAndReturnSourceId}
        onIngested={(sourceId) => {
          setPdfOpen(false);
          router.push(`/app/atlases/${slug}/reading/${sourceId}`);
        }}
      />
    ) : null}
    </>
  );
}

/**
 * State-driven action cluster. Each state shows only the buttons that make
 * sense; the kebab menu surfaces the lateral transitions so the happy-path
 * button stays the obvious click.
 */
function StatusActions({
  resource: r,
  busy,
  onStart,
  onView,
  onChangeStatus,
  onRemove,
}: {
  resource: PathResource;
  busy: boolean;
  onStart: () => void;
  onView: () => void;
  onChangeStatus: (s: PathResourceUserStatus) => void;
  onRemove: () => void;
}) {
  const status = r.user_status;
  const hasSource = !!r.source_id;

  const kebab = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={busy}
          aria-label="更多操作"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "reading" || status === "accepted" ? (
          <>
            <DropdownMenuItem onSelect={() => onChangeStatus("finished")}>
              <Check className="h-3 w-3" /> 标为已读
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onChangeStatus("skipped")}>
              <Undo2 className="h-3 w-3" /> 跳过
            </DropdownMenuItem>
          </>
        ) : null}
        {status === "finished" ? (
          <DropdownMenuItem onSelect={() => onChangeStatus("reading")}>
            <RotateCcw className="h-3 w-3" /> 重新打开
          </DropdownMenuItem>
        ) : null}
        {status === "suggested" ? (
          <DropdownMenuItem onSelect={() => onChangeStatus("skipped")}>
            <Undo2 className="h-3 w-3" /> 跳过
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onRemove} destructive>
          <Trash2 className="h-3 w-3" /> 删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (status === "skipped") {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => onChangeStatus("suggested")} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RotateCcw className="h-3 w-3" /> 恢复</>}
        </Button>
        {kebab}
      </>
    );
  }

  if (status === "finished") {
    return (
      <>
        <Button size="sm" variant="outline" onClick={onView} disabled={busy}>
          <Eye className="h-3 w-3" /> 查看
        </Button>
        {kebab}
      </>
    );
  }

  if (status === "reading" || (status === "accepted" && hasSource)) {
    // Orphan guard: reading without a source_id means the user deleted the
    // source from the reading list before we had the DELETE→suggested sync.
    // Show a restart affordance instead of 继续阅读 that leads nowhere.
    if (status === "reading" && !hasSource) {
      return (
        <>
          <Button size="sm" onClick={onStart} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <RotateCcw className="h-3 w-3" /> 重新开始
              </>
            )}
          </Button>
          {kebab}
        </>
      );
    }
    return (
      <>
        <Button size="sm" onClick={onView} disabled={busy}>
          <Play className="h-3 w-3" /> 继续阅读
        </Button>
        {kebab}
      </>
    );
  }

  // suggested (or unusual accepted-without-source fallback)
  return (
    <>
      <Button size="sm" onClick={onStart} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Play className="h-3 w-3" /> 开始读</>}
      </Button>
      {kebab}
    </>
  );
}
