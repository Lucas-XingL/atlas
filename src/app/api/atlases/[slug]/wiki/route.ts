import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getAtlasBySlug } from "@/lib/atlas-data";
import type { WikiLink, WikiPage } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Graph payload for the 知识库 view.
 *
 * - Nodes: every wiki_page in this atlas (except `log`, which is surfaced
 *   separately as a timeline).
 * - Edges: wiki_links resolved to real pages. Dangling links (to_page IS NULL)
 *   are dropped — they'll be shown inline on the page but aren't renderable as
 *   edges.
 */
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const supabase = createSupabaseServer();
  const atlas = await getAtlasBySlug(params.slug);
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [{ data: pages }, { data: links }] = await Promise.all([
    supabase
      .from("wiki_pages")
      .select("id, slug, title, kind, frontmatter, revision, updated_at")
      .eq("atlas_id", atlas.id)
      .order("kind")
      .order("title"),
    supabase
      .from("wiki_links")
      .select("from_page, to_page")
      .eq("atlas_id", atlas.id)
      .not("to_page", "is", null),
  ]);

  const pageRows = (pages ?? []) as Array<
    Pick<WikiPage, "id" | "slug" | "title" | "kind" | "frontmatter" | "revision" | "updated_at">
  >;
  const linkRows = (links ?? []) as Array<Pick<WikiLink, "from_page" | "to_page">>;

  const nodes = pageRows
    .filter((p) => p.kind !== "log")
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      kind: p.kind,
      revision: p.revision,
      updated_at: p.updated_at,
      tags: Array.isArray(p.frontmatter?.tags) ? (p.frontmatter!.tags as string[]) : [],
    }));

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges = linkRows
    .filter((l) => l.to_page && nodeIdSet.has(l.from_page) && nodeIdSet.has(l.to_page!))
    .map((l) => ({ source: l.from_page, target: l.to_page! }));

  return NextResponse.json({ nodes, edges });
}
