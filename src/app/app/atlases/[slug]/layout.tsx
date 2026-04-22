import { notFound } from "next/navigation";
import { AtlasHeader } from "@/components/atlas-header";
import { AtlasTabs } from "@/components/atlas-tabs";
import { getAtlasBySlug } from "@/lib/atlas-data";

export default async function AtlasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const atlas = await getAtlasBySlug(params.slug);
  if (!atlas) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <AtlasHeader atlas={atlas} />
      <AtlasTabs slug={atlas.slug} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
