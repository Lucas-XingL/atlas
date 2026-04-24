import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { SourceReaderClient } from "./source-reader-client";
import type { Highlight, JournalEntry, Source } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SourceDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const supabase = createSupabaseServer();
  const slug = decodeSlug(params.slug);

  const { data: source } = await supabase
    .from("sources")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<Source>();

  if (!source) notFound();

  const [{ data: highlights }, { data: sourceJournals }] = await Promise.all([
    supabase
      .from("highlights")
      .select("*")
      .eq("source_id", source.id)
      .order("start_offset", { ascending: true }),
    supabase
      .from("journal_entries")
      .select("*")
      .eq("source_ref", source.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <SourceReaderClient
      slug={slug}
      source={source}
      initialHighlights={(highlights ?? []) as Highlight[]}
      initialSourceJournals={(sourceJournals ?? []) as JournalEntry[]}
    />
  );
}
