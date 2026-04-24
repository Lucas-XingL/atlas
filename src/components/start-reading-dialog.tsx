"use client";

import * as React from "react";
import { Loader2, Upload, Link as LinkIcon, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Shared "how do you want to start reading this?" dialog used when the user
 * accepts an AI-suggested learning path resource. The AI only gives titles
 * and search hints now — the user is responsible for providing the content:
 *
 *   - paste a URL (web page / arxiv / video landing page)
 *   - upload a PDF or EPUB (converted to text server-side)
 *   - paste the text directly (for offline / copy-pasted excerpts)
 *
 * The dialog handles the mechanical steps (upload, submit) and hands the
 * caller a source_id once a source row has been created.
 */

type Mode = "url" | "pdf" | "text";

const MAX_BYTES = 200 * 1024 * 1024;

type DocKind = "pdf" | "epub";

function classifyFile(f: File): DocKind | null {
  const name = f.name.toLowerCase();
  if (f.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (f.type === "application/epub+zip" || name.endsWith(".epub")) return "epub";
  return null;
}

export interface StartReadingDialogProps {
  open: boolean;
  resourceTitle: string;
  searchHint?: string | null;
  onClose: () => void;
  /**
   * Called after the source has been created (and PDF ingested if applicable).
   * The caller typically navigates to /reading/:id.
   */
  onReady: (sourceId: string) => void;
  /**
   * Low-level: POST the chosen content to the accept endpoint. The dialog
   * stays reusable by not hard-coding the route.
   *
   * Must return { source_id, needs_pdf_ingest? }.
   */
  submitContent: (content: StartReadingContent) => Promise<{
    source_id: string;
    needs_pdf_ingest?: boolean;
  }>;
}

export type StartReadingContent =
  | { kind: "url"; url: string }
  | { kind: "pdf"; pdf_storage_path: string }
  | { kind: "text"; text: string };

export function StartReadingDialog({
  open,
  resourceTitle,
  searchHint,
  onClose,
  onReady,
  submitContent,
}: StartReadingDialogProps) {
  const [mode, setMode] = React.useState<Mode>("url");
  const [url, setUrl] = React.useState("");
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [fileKind, setFileKind] = React.useState<DocKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<"idle" | "uploading" | "submitting" | "ingesting">(
    "idle"
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setMode("url");
      setUrl("");
      setText("");
      setFile(null);
      setFileKind(null);
      setError(null);
      setStage("idle");
    }
  }, [open]);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      setFileKind(null);
      return;
    }
    const kind = classifyFile(f);
    if (!kind) {
      setError("请选择 PDF 或 EPUB 文件");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`文件过大：${(f.size / 1024 / 1024).toFixed(1)}MB，上限 200MB`);
      return;
    }
    setFile(f);
    setFileKind(kind);
  }

  async function submit() {
    setError(null);
    try {
      if (mode === "url") {
        if (!/^https?:\/\//.test(url.trim())) {
          setError("请输入完整 URL（http:// 或 https://）");
          return;
        }
        setStage("submitting");
        const { source_id } = await submitContent({ kind: "url", url: url.trim() });
        onReady(source_id);
        return;
      }

      if (mode === "text") {
        const t = text.trim();
        if (t.length < 20) {
          setError("至少 20 字");
          return;
        }
        setStage("submitting");
        const { source_id } = await submitContent({ kind: "text", text: t });
        onReady(source_id);
        return;
      }

      // PDF / EPUB: upload to storage first, then accept with the path.
      if (!file || !fileKind) {
        setError("请选择一个 PDF 或 EPUB 文件");
        return;
      }
      setStage("uploading");
      const supabase = createSupabaseBrowser();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("未登录");
      // Storage path must start with <user_id>/. Use a random key so repeated
      // uploads for the same resource don't collide.
      const ext = fileKind === "epub" ? "epub" : "pdf";
      const mime = fileKind === "epub" ? "application/epub+zip" : "application/pdf";
      const key = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("pdfs")
        .upload(key, file, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`上传失败: ${upErr.message}`);

      setStage("submitting");
      const { source_id } = await submitContent({
        kind: "pdf",
        pdf_storage_path: key,
      });

      // Trigger server-side extraction + summarize.
      setStage("ingesting");
      const res = await fetch(`/api/sources/${source_id}/pdf-ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_storage_path: key }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `pdf-ingest HTTP ${res.status}`);
      }
      onReady(source_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setStage("idle");
    }
  }

  if (!open) return null;

  const busy = stage !== "idle";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">开始读《{resourceTitle}》</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              AI 只推荐读什么 · 你提供怎么读
              {searchHint ? (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  🔍 {searchHint}
                </span>
              ) : null}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="mt-5 inline-flex rounded-md border border-border/60 bg-card/50 text-xs">
          {(
            [
              { v: "url", label: "URL", icon: <LinkIcon className="h-3 w-3" /> },
              { v: "pdf", label: "上传 PDF / EPUB", icon: <Upload className="h-3 w-3" /> },
              { v: "text", label: "粘贴正文", icon: <FileText className="h-3 w-3" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              onClick={() => !busy && setMode(t.v)}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 transition-colors",
                mode === t.v
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Mode body */}
        <div className="mt-4">
          {mode === "url" ? (
            <div className="space-y-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
                placeholder="https://example.com/article"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                适用于公开可读的网页、博客、Arxiv、YouTube 等。抓取不到会让你退到粘贴或上传。
              </p>
            </div>
          ) : null}

          {mode === "pdf" ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
              >
                <Upload className="h-6 w-6" />
                {file ? (
                  <>
                    <span className="font-medium text-foreground">
                      {file.name}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {fileKind}
                      </span>
                    </span>
                    <span className="text-xs">
                      {(file.size / 1024 / 1024).toFixed(1)}MB · 点击更换
                    </span>
                  </>
                ) : (
                  <>
                    <span>点击选择 PDF 或 EPUB 文件</span>
                    <span className="text-xs">
                      最大 200MB · 含文字层的 PDF / 非 DRM 的 EPUB
                    </span>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,application/epub+zip,.pdf,.epub"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : null}

          {mode === "text" ? (
            <div className="space-y-2">
              <Textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                placeholder="粘贴正文、章节要点或摘抄（≥20 字）…AI 会生成摘要，并作为你划线 / 随记 / 蒸馏的内容载体。"
              />
              <div className="text-[10px] text-muted-foreground">
                {text.trim().length} 字 · 至少 20 字
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {stage === "uploading" ? <Status label="上传中…" /> : null}
        {stage === "submitting" ? <Status label="创建资源中…" /> : null}
        {stage === "ingesting" ? (
          <Status label={fileKind === "epub" ? "解析 EPUB 并生成摘要…" : "解析 PDF 并生成摘要…"} />
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                处理中…
              </>
            ) : (
              "开始读"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Status({ label }: { label: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> {label}
    </div>
  );
}
