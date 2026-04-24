import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getAtlasBySlug } from "@/lib/atlas-data";
import type { WikiLink, WikiPage } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Fetch a single wiki page (by slug) with its backlinks.
 */
export async function GET(
  _req: Request,
  { params }: { params: { slug: string; pageSlug: string } }
) {
  const supabase = createSupabaseServer();
  const atlas = await getAtlasBySlug(params.slug);
  if (!atlas) return NextResponse.json({ error: "atlas not found" }, { status: 404 });

  const { data: page } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("atlas_id", atlas.id)
    .eq("slug", params.pageSlug)
    .maybeSingle<WikiPage>();

  if (!page) return NextResponse.json({ error: "page not found" }, { status: 404 });

  // Backlinks: other pages whose body links to this page.
  const { data: incoming } = await supabase
    .from("wiki_links")
    .select("from_page")
    .eq("atlas_id", atlas.id)
    .eq("to_page", page.id);

  const fromIds = Array.from(
    new Set(((incoming ?? []) as Pick<WikiLink, "from_page">[]).map((r) => r.from_page))
  );

  let backlinks: Array<Pick<WikiPage, "id" | "slug" | "title" | "kind">> = [];
  if (fromIds.length > 0) {
    const { data: pages } = await supabase
      .from("wiki_pages")
      .select("id, slug, title, kind")
      .in("id", fromIds);
    backlinks = (pages ?? []) as typeof backlinks;
  }

  return NextResponse.json({ page, backlinks });
}
