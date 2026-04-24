import { createSupabaseServer } from "@/lib/supabase/server";
import { getAtlasBySlug } from "@/lib/atlas-data";
import { WikiClient } from "./wiki-client";
import type { WikiLogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WikiPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { page?: string };
}) {
  const atlas = await getAtlasBySlug(params.slug);
  if (!atlas) return null;
  const supabase = createSupabaseServer();

  const [{ data: pages }, { data: links }, { data: logs }, { count: sourceCount }, { count: ingestedCount }] =
    await Promise.all([
      supabase
        .from("wiki_pages")
        .select("id, slug, title, kind, frontmatter, revision, updated_at")
        .eq("atlas_id", atlas.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("wiki_links")
        .select("from_page, to_page")
        .eq("atlas_id", atlas.id)
        .not("to_page", "is", null),
      supabase
        .from("wiki_log")
        .select("*")
        .eq("atlas_id", atlas.id)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("sources")
        .select("id", { count: "exact", head: true })
        .eq("atlas_id", atlas.id),
      supabase
        .from("sources")
        .select("id", { count: "exact", head: true })
        .eq("atlas_id", atlas.id)
        .not("wiki_ingested_at", "is", null),
    ]);

  const pageRows = (pages ?? []) as Array<{
    id: string;
    slug: string;
    title: string;
    kind: "source" | "concept" | "index" | "log" | "synthesis";
    frontmatter: Record<string, unknown>;
    revision: number;
    updated_at: string;
  }>;

  const linkRows = (links ?? []) as Array<{ from_page: string; to_page: string }>;

  const nodes = pageRows
    .filter((p): p is typeof p & { kind: "source" | "concept" | "index" | "synthesis" } =>
      p.kind !== "log"
    )
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      kind: p.kind,
      updated_at: p.updated_at,
      tags: Array.isArray(p.frontmatter?.tags) ? (p.frontmatter!.tags as string[]) : [],
    }));

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges = linkRows
    .filter((l) => nodeIdSet.has(l.from_page) && nodeIdSet.has(l.to_page))
    .map((l) => ({ source: l.from_page, target: l.to_page }));

  return (
    <WikiClient
      slug={atlas.slug}
      nodes={nodes}
      edges={edges}
      logs={(logs ?? []) as WikiLogEntry[]}
      sourceCount={sourceCount ?? 0}
      ingestedCount={ingestedCount ?? 0}
      initialSlug={searchParams.page ?? null}
    />
  );
}
