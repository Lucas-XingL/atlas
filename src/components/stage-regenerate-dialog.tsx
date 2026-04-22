"use client";

import * as React from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface StageRegenerateDialogProps {
  open: boolean;
  stageName: string;
  onClose: () => void;
  onSubmit: (feedback: string) => Promise<void>;
}

export function StageRegenerateDialog({
  open,
  stageName,
  onClose,
  onSubmit,
}: StageRegenerateDialogProps) {
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFeedback("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await onSubmit(feedback.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1.5 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              重新生成资源
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              阶段：{stageName}
            </p>
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

        <div className="mt-4 space-y-2">
          <label className="text-xs text-muted-foreground">
            想给 AI 什么方向？（可选，300 字内）
          </label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={busy}
            placeholder="例如：资源太理论了，想要偏工程的，希望多一些实战项目"
            rows={4}
            maxLength={500}
            className="resize-none"
          />
          <div className="text-[11px] text-muted-foreground">
            当前阶段的已有资源会被新生成的替换；阶段名称和目标保持不变。
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                生成中…
              </>
            ) : (
              "重新生成"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
