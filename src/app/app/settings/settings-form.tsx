"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LlmProvider, UserSettings } from "@/lib/types";

type InitialSettings = (UserSettings & { llm_api_key: string | null }) | null;

const MODEL_DEFAULTS: Record<LlmProvider, { quality: string; fast: string; hint: string }> = {
  zhipu: {
    quality: "glm-5.1",
    fast: "glm-4.7-flashx",
    hint: "智谱 GLM · 默认用 glm-5.1 做 distill/digest，glm-4.7-flashx 做 summary",
  },
  minimax: {
    quality: "MiniMax-M2.7",
    fast: "MiniMax-M2.7-highspeed",
    hint: "MiniMax · 默认用 MiniMax-M2.7 做 distill/digest，highspeed 版做 summary",
  },
};

export function SettingsForm({ initial }: { initial: InitialSettings }) {
  const router = useRouter();
  const [provider, setProvider] = React.useState<LlmProvider>(initial?.llm_provider ?? "zhipu");
  const [modelQuality, setModelQuality] = React.useState(initial?.llm_model_quality ?? "");
  const [modelFast, setModelFast] = React.useState(initial?.llm_model_fast ?? "");
  const [apiKey, setApiKey] = React.useState(initial?.llm_api_key ?? "");
  const [minimaxGroupId, setMinimaxGroupId] = React.useState(initial?.minimax_group_id ?? "");
  const [timezone, setTimezone] = React.useState(initial?.timezone ?? "Asia/Shanghai");
  const [morningTime, setMorningTime] = React.useState(
    (initial?.morning_ritual_time ?? "08:00:00").slice(0, 5)
  );
  const [emailEnabled, setEmailEnabled] = React.useState(initial?.email_push_enabled ?? true);
  const [submitting, setSubmitting] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setToast(null);

    const payload: Record<string, unknown> = {
      llm_provider: provider,
      llm_model_quality: modelQuality || null,
      llm_model_fast: modelFast || null,
      minimax_group_id: minimaxGroupId || null,
      timezone,
      morning_ritual_time: `${morningTime}:00`,
      email_push_enabled: emailEnabled,
    };
    // Only send api_key if the user actually changed it (not the masked value)
    if (apiKey && apiKey !== "***") {
      payload.llm_api_key = apiKey;
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "保存失败");
      }
      setToast("已保存");
      router.refresh();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  const defaults = MODEL_DEFAULTS[provider];

  return (
    <form onSubmit={save} className="space-y-8">
      <Section title="LLM 厂商">
        <div className="grid grid-cols-2 gap-2">
          {(["zhipu", "minimax"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={
                provider === p
                  ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
                  : "rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }
            >
              {p === "zhipu" ? "智谱 GLM" : "MiniMax"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{defaults.hint}</p>

        <div className="mt-4 space-y-3">
          <Field label={`${provider === "zhipu" ? "智谱" : "MiniMax"} API Key`}>
            <Input
              type="password"
              placeholder={initial?.llm_api_key === "***" ? "已保存（输入新值可覆盖）" : "粘贴 API key"}
              value={apiKey === "***" ? "" : apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {provider === "minimax" ? (
            <Field label="MiniMax Group ID（可选）">
              <Input
                value={minimaxGroupId}
                onChange={(e) => setMinimaxGroupId(e.target.value)}
                placeholder="18..."
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quality 模型（distill / digest）">
              <Input
                value={modelQuality}
                onChange={(e) => setModelQuality(e.target.value)}
                placeholder={defaults.quality}
              />
            </Field>
            <Field label="Fast 模型（summary）">
              <Input
                value={modelFast}
                onChange={(e) => setModelFast(e.target.value)}
                placeholder={defaults.fast}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="晨间推送">
        <div className="grid grid-cols-2 gap-3">
          <Field label="时区">
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
          <Field label="推送时间">
            <Input
              type="time"
              value={morningTime}
              onChange={(e) => setMorningTime(e.target.value)}
            />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          启用邮件推送
        </label>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "保存中..." : "保存"}
        </Button>
        {toast ? <span className="text-xs text-muted-foreground">{toast}</span> : null}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="rounded-lg border border-border bg-card/40 p-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
