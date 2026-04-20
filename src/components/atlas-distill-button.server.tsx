import { createSupabaseServer } from "@/lib/supabase/server";
import { DistillButton } from "./atlas-distill-button";

export async function AtlasDistillButton({ slug }: { slug: string }) {
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!atlas) return null;

  const { count } = await supabase
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("atlas_id", atlas.id)
    .eq("status", "raw");

  return <DistillButton slug={slug} rawCount={count ?? 0} />;
}
