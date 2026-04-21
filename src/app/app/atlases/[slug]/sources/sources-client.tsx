"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";
import type { Source } from "@/lib/types";

export function SourcesPageClient({
  slug,
  initial,
}: {
  slug: string;
  initial: Source[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"add" | "paste">("add");
  const [url, setUrl] = React.useState("");
  const [pasteTitle, setPasteTitle] = React.useState("");
  const [pasteText, setPasteText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Poll to pick up status changes while a source is being fetched/summarized.
  React.useEffect(() => {
    const hasPending = initial.some(
      (s) => s.fetch_status === "pending" || s.fetch_status === "fetching" || s.fetch_status === "summarizing"
    );
    if (!hasPending) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [initial, router]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body = tab === "add" ? { url } : { text: pasteText, title: pasteTitle || undefined };
      const res = await fetch(`/api/atlases/${slug}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "提交失败");
      }
      setUrl("");
      setPasteTitle("");
      setPasteText("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const [manualOpen, setManualOpen] = React.useState(false);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10 space-y-8">
      <section>
        <a
          href={`/app/atlases/${slug}/kickstart`}
          className="group flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-5 transition-colors hover:bg-primary/15"
        >
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-primary">
              ✨ AI 推源
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              让 AI 基于你的 thesis 搜 8-12 篇入门材料并分档
            </div>
          </div>
          <div className="text-primary opacity-60 transition-opacity group-hover:opacity-100">
            →
          </div>
        </a>

        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground"
        >
          {manualOpen ? "▾" : "▸"} 手动添加（URL / 粘贴文本）
        </button>

        {manualOpen ? (
          <div className="mt-3 rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-3 flex gap-4 text-sm">
              {["add", "paste"].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k as "add" | "paste")}
                  className={
                    tab === k
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  {k === "add" ? "URL" : "粘贴文本"}
                </button>
              ))}
            </div>
            {tab === "add" ? (
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && url && submit()}
                />
                <Button onClick={submit} disabled={submitting || !url}>
                  {submitting ? "处理..." : "Ingest"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="标题 (可选)"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
                <Textarea
                  rows={6}
                  placeholder="粘贴正文..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <Button onClick={submit} disabled={submitting || pasteText.length < 20}>
                  {submitting ? "处理..." : "保存"}
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Sources ({initial.length})
        </h2>
        {initial.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            还没有 source。点上面「✨ AI 推源」让 AI 帮你找一批。
          </div>
        ) : (
          <div className="space-y-3">
            {initial.map((s) => (
              <SourceItem key={s.id} source={s} slug={slug} onDelete={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SourceItem({ source, slug, onDelete }: { source: Source; slug: string; onDelete: () => void }) {
  const router = useRouter();
  const [showPaste, setShowPaste] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!confirm("删除这条 source？")) return;
    await fetch(`/api/atlases/${slug}/sources/${source.id}`, { method: "DELETE" });
    onDelete();
  }

  async function retry() {
    setBusy(true);
    try {
      await fetch(`/api/sources/${source.id}/process`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitPaste() {
    if (pasteText.trim().length < 20) return;
    setBusy(true);
    try {
      await fetch(`/api/sources/${source.id}/paste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText, title: source.title }),
      });
      setShowPaste(false);
      setPasteText("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusBadge status={source.fetch_status} />
              {source.ai_recommended ? (
                <Badge variant="default">✨ AI 推荐</Badge>
              ) : null}
              <span className="text-[11px] text-muted-foreground">
                {formatRelative(source.ingested_at)}
              </span>
            </div>
            <div className="mt-2 text-base font-semibold">{source.title}</div>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-xs text-muted-foreground hover:text-foreground"
              >
                {source.url}
              </a>
            ) : null}
            {source.summary?.why_relevant ? (
              <div className="mt-2 rounded bg-primary/10 px-2 py-1 text-xs text-primary/90">
                💡 {source.summary.why_relevant}
              </div>
            ) : null}
            {source.summary?.tl_dr ? (
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                {source.summary.tl_dr}
              </p>
            ) : null}
            {source.summary?.key_claims && source.summary.key_claims.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                {source.summary.key_claims.slice(0, 3).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : null}
            {source.fetch_status === "failed" && source.fetch_error ? (
              <div className="mt-3 space-y-2">
                <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                  抓取失败：{source.fetch_error}
                </div>
                <div className="flex gap-2">
                  {source.url ? (
                    <Button size="sm" variant="outline" onClick={retry} disabled={busy}>
                      {busy ? "..." : "重试"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPaste((v) => !v)}
                    disabled={busy}
                  >
                    {showPaste ? "取消" : "粘贴正文"}
                  </Button>
                </div>
                {showPaste ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={6}
                      placeholder="把原文粘过来（≥20 字）..."
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={submitPaste}
                      disabled={busy || pasteText.trim().length < 20}
                    >
                      {busy ? "处理..." : "保存并生成摘要"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            onClick={remove}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            删除
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Source["fetch_status"] }) {
  const map: Record<Source["fetch_status"], { label: string; variant: "default" | "outline" | "success" }> = {
    pending: { label: "排队中", variant: "outline" },
    fetching: { label: "抓取中...", variant: "default" },
    summarizing: { label: "AI 摘要中...", variant: "default" },
    ready: { label: "✓ 就绪", variant: "success" },
    failed: { label: "失败", variant: "outline" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}
