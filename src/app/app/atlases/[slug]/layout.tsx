import { notFound } from "next/navigation";
import { getAtlasBySlug } from "@/lib/atlas-data";
import { AtlasShell } from "@/components/atlas-shell";

export default async function AtlasLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const atlas = await getAtlasBySlug(params.slug);
  if (!atlas) notFound();

  return <AtlasShell atlas={atlas}>{children}</AtlasShell>;
}
