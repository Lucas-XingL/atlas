"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    try {
      const supabase = createSupabaseBrowser();
      const redirectTo = new URL("/auth/callback", window.location.origin);
      if (next) redirectTo.searchParams.set("next", next);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo.toString() },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "登录失败");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="text-2xl">📬</div>
        <div className="mt-3 text-sm font-medium">检查你的邮箱</div>
        <div className="mt-1 text-xs text-muted-foreground">
          我们已发送登录链接到 {email}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={status === "sending"}>
        {status === "sending" ? "发送中..." : "发送登录链接"}
      </Button>
      {errorMsg ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {errorMsg}
        </div>
      ) : null}
    </form>
  );
}
