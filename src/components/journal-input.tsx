"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function JournalInput({ slug }: { slug: string }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/atlases/${slug}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setText("");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="此刻在想什么？Cmd+Enter 提交"
        rows={3}
        className="resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">AI 今晚会提炼</div>
        <Button size="sm" onClick={submit} disabled={submitting || !text.trim()}>
          记录
        </Button>
      </div>
    </div>
  );
}
