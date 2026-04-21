"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/utils";
import type { ManualCandidate } from "@/lib/types";

export function ManualSection({
  slug,
  initial,
}: {
  slug: string;
  initial: ManualCandidate[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function accept(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/recommendations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "manual", ref_id: id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`入池失败: ${j.error ?? res.status}`);
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteOne(id: string) {
    if (!confirm("删除这条候选？")) return;
    setBusyId(id);
    try {
      await fetch(`/api/manual-candidates/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <ManualAdd slug={slug} onAdded={() => router.refresh()} />

      {initial.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          还没有候选 · 上面贴个链接或文本开始
        </div>
      ) : (
        <div className="space-y-2">
          {initial.map((c) => (
            <ManualCard
              key={c.id}
              candidate={c}
              busy={busyId === c.id}
              onAccept={() => accept(c.id)}
              onDelete={() => deleteOne(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ManualAdd({ slug, onAdded }: { slug: string; onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"url" | "text">("url");
  const [url, setUrl] = React.useState("");
  const [text, setText] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      const body =
        mode === "url"
          ? { url, title: title || undefined, note: note || undefined }
          : { text_snippet: text, title: title || undefined, note: note || undefined };
      const res = await fetch(`/api/atlases/${slug}/manual-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setUrl("");
        setText("");
        setTitle("");
        setNote("");
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
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-border bg-card/20 p-4 text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
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
        <Input
          placeholder="备注：为什么想看（可选）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
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

function ManualCard({
  candidate: c,
  busy,
  onAccept,
  onDelete,
}: {
  candidate: ManualCandidate;
  busy: boolean;
  onAccept: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/60 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
            {c.url ? "链接" : "文本片段"}
          </span>
          <span>{formatRelative(c.created_at)}</span>
        </div>
        <div className="mt-1 text-sm font-medium">{c.title}</div>
        {c.url ? (
          <a
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
          >
            {c.url}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : null}
        {c.text_snippet && !c.url ? (
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {c.text_snippet}
          </div>
        ) : null}
        {c.note ? (
          <div className="mt-1.5 rounded bg-primary/10 px-2 py-1 text-xs text-primary/90">
            💡 {c.note}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={onAccept} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "入池"}
        </Button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="text-[11px] text-muted-foreground hover:text-destructive"
        >
          删除
        </button>
      </div>
    </div>
  );
}
