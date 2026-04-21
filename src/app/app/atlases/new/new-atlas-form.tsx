"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function NewAtlasForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [thesis, setThesis] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/atlases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, thesis }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "创建失败" }));
        throw new Error(body.error ?? "创建失败");
      }
      const { atlas } = await res.json();
      router.push(`/app/atlases/${atlas.slug}/path/new`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Atlas 名字 *</Label>
        <Input
          id="name"
          required
          placeholder="例如：LLM Harness"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="thesis">主题描述</Label>
        <Textarea
          id="thesis"
          placeholder="例如：未来 18 个月的关键竞争点是 harness + context engineering。"
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          rows={4}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          一两句话说明你为什么建这个 Atlas，AI 会据此推荐阅读材料。
        </p>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting || name.length < 2}>
          {submitting ? "创建中..." : "创建"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </form>
  );
}
