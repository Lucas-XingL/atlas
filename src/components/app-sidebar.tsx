"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, BookOpen, Settings, LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppSidebar({
  atlases,
  email,
}: {
  atlases: Array<{ id: string; slug: string; name: string }>;
  email: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex-1 px-3 py-4 space-y-6">
        <div>
          <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            快捷
          </div>
          <SideLink
            href="/app/flashcards/due"
            icon={<Sparkles className="h-4 w-4" />}
            active={pathname === "/app/flashcards/due"}
          >
            今日复习
          </SideLink>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Atlases
            </span>
            <Link
              href="/app/atlases/new"
              className="text-muted-foreground hover:text-foreground"
              aria-label="新建 Atlas"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-0.5">
            {atlases.length === 0 ? (
              <Link
                href="/app/atlases/new"
                className="block rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                + 新建第一个 Atlas
              </Link>
            ) : (
              atlases.map((a) => {
                const base = `/app/atlases/${a.slug}`;
                const active = pathname?.startsWith(base);
                return (
                  <SideLink
                    key={a.id}
                    href={base}
                    icon={<BookOpen className="h-4 w-4" />}
                    active={active ?? false}
                  >
                    {a.name}
                  </SideLink>
                );
              })
            )}
          </div>
        </div>
      </nav>

      <div className="border-t border-border/60 p-3">
        <Link
          href="/app/settings"
          className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          设置
        </Link>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            退出
          </button>
        </form>
        <div className="mt-3 truncate px-2 text-[11px] text-muted-foreground">
          {email}
        </div>
      </div>
    </div>
  );
}

function SideLink({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground/80 hover:bg-muted hover:text-foreground"
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}
