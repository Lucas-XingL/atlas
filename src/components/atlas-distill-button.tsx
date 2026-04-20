"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DistillButton({ slug, rawCount }: { slug: string; rawCount: number }) {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function trigger() {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/atlases/${slug}/distill`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      setMsg(`新增 ${json.cards} 张 · archived ${json.archived} 条`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "失败");
    } finally {
      setRunning(false);
    }
  }

  if (rawCount === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline" onClick={trigger} disabled={running}>
        {running ? "提炼中..." : `现在提炼 (${rawCount})`}
      </Button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
