"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AtlasTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/app/atlases/${slug}`;

  const tabs = [
    { href: base, label: "概览" },
    { href: `${base}/path`, label: "路径" },
    { href: `${base}/sources`, label: "来源" },
    { href: `${base}/journal`, label: "随记" },
    { href: `${base}/flashcards`, label: "卡片" },
  ];

  return (
    <nav className="sticky top-0 z-10 border-b border-border/60 bg-background/80 px-8 backdrop-blur">
      <div className="mx-auto flex max-w-5xl gap-6 text-sm">
        {tabs.map((t) => {
          const exact = t.href === base;
          const active = exact ? pathname === t.href : pathname?.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative py-3 transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-px bg-primary" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
