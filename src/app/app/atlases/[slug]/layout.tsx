import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { AtlasHeader } from "@/components/atlas-header";
import { AtlasTabs } from "@/components/atlas-tabs";

export default async function AtlasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const slug = decodeSlug(params.slug);
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, slug, name, thesis")
    .eq("slug", slug)
    .maybeSingle();

  if (!atlas) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <AtlasHeader atlas={atlas} />
      <AtlasTabs slug={atlas.slug} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
