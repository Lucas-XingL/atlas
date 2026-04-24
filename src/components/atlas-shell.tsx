"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AtlasHeader } from "@/components/atlas-header";
import { AtlasTabs } from "@/components/atlas-tabs";

const FOCUS_PATTERNS = [/^\/app\/atlases\/[^/]+\/reading\/[^/]+$/];

function isFocusRoute(p: string | null): boolean {
  if (!p) return false;
  return FOCUS_PATTERNS.some((re) => re.test(p));
}

interface AtlasForShell {
  id: string;
  slug: string;
  name: string;
  thesis: string | null;
}

/**
 * Atlas shell — hides the atlas-level header + tab bar when the user is on
 * the reader detail page. Keeps them for every other atlas subpage.
 */
export function AtlasShell({
  atlas,
  children,
}: {
  atlas: AtlasForShell;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const focus = isFocusRoute(pathname);

  return (
    <div className="flex min-h-screen flex-col">
      {focus ? null : (
        <>
          <AtlasHeader atlas={atlas} />
          <AtlasTabs slug={atlas.slug} />
        </>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

