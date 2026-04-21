import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { ReadingClient } from "./reading-client";
import type { Source } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReadingPage({ params }: { params: { slug: string } }) {
  const slug = decodeSlug(params.slug);
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!atlas) return null;

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("ingested_at", { ascending: false });

  return <ReadingClient slug={slug} initial={(sources ?? []) as Source[]} />;
}
