import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { notFound } from "next/navigation";
import { RecommendationsClient } from "./recommendations-client";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseServer();
  const slug = decodeSlug(params.slug);

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!atlas) notFound();

  return <RecommendationsClient slug={slug} atlasName={atlas.name} />;
}
