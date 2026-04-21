import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { KickstartClient } from "./kickstart-client";
import { notFound } from "next/navigation";

export default async function KickstartPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, slug, name, thesis")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) notFound();

  return <KickstartClient slug={atlas.slug} name={atlas.name} thesis={atlas.thesis} />;
}
