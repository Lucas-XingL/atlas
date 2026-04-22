import { createSupabaseServer } from "@/lib/supabase/server";
import { getAtlasBySlug } from "@/lib/atlas-data";
import { ReadingClient } from "./reading-client";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReadingPage({ params }: { params: { slug: string } }) {
  const atlas = await getAtlasBySlug(params.slug);
  if (!atlas) return null;
  const supabase = createSupabaseServer();

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("ingested_at", { ascending: false });

  return <ReadingClient slug={atlas.slug} initial={(sources ?? []) as Source[]} />;
}
