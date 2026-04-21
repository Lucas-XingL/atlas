"use client";

import Link from "next/link";
import { BookOpen, Radio, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubTab = "plan" | "subscription" | "manual";

interface Counts {
  path: number;
  subscription: number;
  manual: number;
}

export function RecommendationsShell({
  slug,
  currentTab,
  counts,
  children,
}: {
  slug: string;
  currentTab: SubTab;
  counts: Counts;
  children: React.ReactNode;
}) {
  const tabs: Array<{
    key: SubTab;
    label: string;
    icon: React.ReactNode;
    badge: number;
  }> = [
    { key: "plan", label: "学习计划", icon: <BookOpen className="h-4 w-4" />, badge: counts.path },
    {
      key: "subscription",
      label: "每日订阅",
      icon: <Radio className="h-4 w-4" />,
      badge: counts.subscription,
    },
    { key: "manual", label: "可能会看", icon: <PenLine className="h-4 w-4" />, badge: counts.manual },
  ];

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">内容推荐</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          三条来源管道的候选。挑合适的「入池」进阅读清单。
        </p>
      </div>

      {/* Sub-tab nav */}
      <nav className="mb-6 flex gap-1 border-b border-border/60">
        {tabs.map((t) => {
          const active = t.key === currentTab;
          return (
            <Link
              key={t.key}
              href={`/app/atlases/${slug}/recommendations?tab=${t.key}`}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.badge > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
                    active
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {t.badge}
                </span>
              ) : null}
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
