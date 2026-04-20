import { createSupabaseServer } from "@/lib/supabase/server";
import { SourcesPageClient } from "./sources-client";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SourcesPage({ params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", params.slug)
    .single();
  if (!atlas) return null;

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("ingested_at", { ascending: false });

  return <SourcesPageClient slug={params.slug} initial={(sources ?? []) as Source[]} />;
}
