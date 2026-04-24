"use client";

import * as React from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const MAX_BYTES = 200 * 1024 * 1024;

type DocKind = "pdf" | "epub";

function classifyFile(f: File): DocKind | null {
  const name = f.name.toLowerCase();
  if (f.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (f.type === "application/epub+zip" || name.endsWith(".epub")) return "epub";
  return null;
}

export interface PdfUploadDialogProps {
  open: boolean;
  resourceTitle: string;
  onClose: () => void;
  /**
   * Called after the document has been fully ingested (text extracted +
   * summarized). Receives the source id so the caller can navigate to
   * /reading/[id].
   */
  onIngested: (sourceId: string) => void;
  /**
   * Called to turn the path resource into a source row (placeholder).
   * Must return a source_id that we can attach the upload to.
   *
   * Kept as a prop so the dialog is reusable outside of path resources.
   */
  createSource: () => Promise<string>;
}

export function PdfUploadDialog({
  open,
  resourceTitle,
  onClose,
  onIngested,
  createSource,
}: PdfUploadDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState<DocKind | null>(null);
  const [stage, setStage] = React.useState<"pick" | "uploading" | "ingesting" | "done">("pick");
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setKind(null);
      setStage("pick");
      setError(null);
      setProgress(0);
    }
  }, [open]);

  function pick(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      setKind(null);
      return;
    }
    const k = classifyFile(f);
    if (!k) {
      setError("请选择 PDF 或 EPUB 文件");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`文件过大：${(f.size / 1024 / 1024).toFixed(1)}MB，上限 200MB`);
      return;
    }
    setFile(f);
    setKind(k);
  }

  async function start() {
    if (!file || !kind) return;
    setError(null);
    try {
      const sourceId = await createSource();

      setStage("uploading");
      const supabase = createSupabaseBrowser();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("未登录");
      const ext = kind === "epub" ? "epub" : "pdf";
      const path = `${userId}/${sourceId}.${ext}`;
      const mime = kind === "epub" ? "application/epub+zip" : "application/pdf";
      const { error: upErr } = await supabase.storage
        .from("pdfs")
        .upload(path, file, { contentType: mime, upsert: true });
      if (upErr) throw new Error(`上传失败: ${upErr.message}`);
      setProgress(100);

      setStage("ingesting");
      const res = await fetch(`/api/sources/${sourceId}/pdf-ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_storage_path: path }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "解析失败");

      setStage("done");
      onIngested(sourceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setStage("pick");
    }
  }

  if (!open) return null;

  const busy = stage === "uploading" || stage === "ingesting";
  const ingestLabel = kind === "epub" ? "解析 EPUB 并生成摘要…" : "解析 PDF 并生成摘要…";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">上传 PDF / EPUB</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{resourceTitle}</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card/40 p-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            <Upload className="h-6 w-6" />
            {file ? (
              <>
                <span className="font-medium text-foreground">
                  {file.name}
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {kind}
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
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {stage === "uploading" ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 上传中…
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {stage === "ingesting" ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> {ingestLabel}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={start} disabled={!file || busy}>
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                处理中…
              </>
            ) : (
              "上传并解析"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
