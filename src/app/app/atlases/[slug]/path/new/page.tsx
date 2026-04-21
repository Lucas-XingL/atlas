import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { PathNewClient } from "./path-new-client";

export default async function PathNewPage({ params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const slug = decodeSlug(params.slug);
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, slug, name, thesis")
    .eq("slug", slug)
    .maybeSingle();

  if (!atlas) return null;

  // If already has an active path, redirect to /path (don't regenerate silently)
  const { data: existing } = await supabase
    .from("learning_paths")
    .select("id")
    .eq("atlas_id", atlas.id)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) {
    redirect(`/app/atlases/${atlas.slug}/path`);
  }

  return <PathNewClient slug={atlas.slug} name={atlas.name} thesis={atlas.thesis} />;
}
