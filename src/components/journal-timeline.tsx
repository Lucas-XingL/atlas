"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import type { JournalEntry } from "@/lib/types";

function groupEntries(entries: JournalEntry[]): Array<{ label: string; items: JournalEntry[] }> {
  const buckets = { today: [] as JournalEntry[], yesterday: [] as JournalEntry[], week: [] as JournalEntry[], older: [] as JournalEntry[] };
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 7 * 86_400_000;

  for (const e of entries) {
    const t = new Date(e.created_at).getTime();
    if (t >= startOfToday) buckets.today.push(e);
    else if (t >= startOfYesterday) buckets.yesterday.push(e);
    else if (t >= startOfWeek) buckets.week.push(e);
    else buckets.older.push(e);
  }

  const out: Array<{ label: string; items: JournalEntry[] }> = [];
  if (buckets.today.length) out.push({ label: "今天", items: buckets.today });
  if (buckets.yesterday.length) out.push({ label: "昨天", items: buckets.yesterday });
  if (buckets.week.length) out.push({ label: "本周", items: buckets.week });
  if (buckets.older.length) out.push({ label: "更早", items: buckets.older });
  return out;
}

export function JournalTimeline({ initialEntries }: { initialEntries: JournalEntry[] }) {
  const groups = groupEntries(initialEntries);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        还没有 journal。在上面写下第一条想法吧。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.label}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {g.label}
          </div>
          <ul className="space-y-2">
            {g.items.map((e) => (
              <li
                key={e.id}
                className="rounded-md border border-border/60 bg-card/40 p-4"
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{e.text}</div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{formatRelative(e.created_at)}</span>
                  {e.status === "distilled" ? (
                    <Badge variant="success">✨ distilled</Badge>
                  ) : e.status === "archived" ? (
                    <Badge variant="outline">archived</Badge>
                  ) : (
                    <Badge variant="outline">pending</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
