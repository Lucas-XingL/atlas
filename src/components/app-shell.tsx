"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/logo";

const FOCUS_ROUTE_PATTERNS = [
  // Reader detail page — users expect to focus on the text, nothing else.
  /^\/app\/atlases\/[^/]+\/reading\/[^/]+$/,
];

function isFocusRoute(path: string | null): boolean {
  if (!path) return false;
  return FOCUS_ROUTE_PATTERNS.some((re) => re.test(path));
}

/**
 * App shell that toggles the left sidebar based on:
 *   - automatic: focus routes (reader detail) auto-hide the sidebar
 *   - manual: user can collapse/expand via the small toggle rail; the choice
 *     is persisted in localStorage across navigations so the preference
 *     sticks when the user returns to a non-focus route.
 *
 * On a focus route we render a thin 16px gutter with a show-sidebar
 * affordance — tapping it slides the full sidebar back in without leaving
 * the reader.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onFocusRoute = isFocusRoute(pathname);

  // User's persisted preference; only honored on non-focus routes.
  const [manuallyCollapsed, setManuallyCollapsed] = React.useState(false);
  // When on a focus route, users can still pop the sidebar back temporarily.
  const [focusOverride, setFocusOverride] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("atlas:sidebar-collapsed");
      if (raw === "1") setManuallyCollapsed(true);
    } catch {
      // ignore storage errors
    }
  }, []);

  // Reset the focus override whenever we leave a focus route so entering a
  // new reader session starts clean (hidden) again.
  React.useEffect(() => {
    if (!onFocusRoute) setFocusOverride(false);
  }, [onFocusRoute]);

  const showSidebar = onFocusRoute ? focusOverride : !manuallyCollapsed;

  function toggleManual() {
    const next = !manuallyCollapsed;
    setManuallyCollapsed(next);
    try {
      window.localStorage.setItem("atlas:sidebar-collapsed", next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar: animated width so the transition feels intentional. */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-border/60 bg-background transition-[width] duration-200 ease-out md:flex md:flex-col",
          showSidebar ? "w-60" : "w-0"
        )}
        aria-hidden={!showSidebar}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border/60 px-4">
          <Link href="/app" className="min-w-0">
            <LogoMark />
          </Link>
          {!onFocusRoute ? (
            <button
              onClick={toggleManual}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="收起侧边栏"
              title="收起侧边栏"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => setFocusOverride(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="隐藏侧边栏"
              title="继续阅读"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="min-w-[15rem] flex flex-1 flex-col">{sidebar}</div>
      </aside>

      {/* Reveal rail: visible when sidebar is hidden (focus route or manual). */}
      {!showSidebar ? (
        <button
          onClick={() => {
            if (onFocusRoute) setFocusOverride(true);
            else toggleManual();
          }}
          className="hidden md:flex group fixed left-0 top-1/2 z-30 -translate-y-1/2 items-center rounded-r-md border border-l-0 border-border/60 bg-card/80 px-1 py-4 text-muted-foreground backdrop-blur hover:text-foreground"
          aria-label="展开侧边栏"
          title="展开侧边栏"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      ) : null}

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
