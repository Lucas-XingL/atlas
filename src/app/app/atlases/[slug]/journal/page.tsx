import { createSupabaseServer } from "@/lib/supabase/server";
import { getAtlasBySlug } from "@/lib/atlas-data";
import { JournalInput } from "@/components/journal-input";
import { JournalTimeline } from "@/components/journal-timeline";
import { AtlasDistillButton } from "@/components/atlas-distill-button.server";
import type { JournalEntry } from "@/lib/types";

export default async function JournalPage({
  params,
}: {
  params: { slug: string };
}) {
  const atlas = await getAtlasBySlug(params.slug);
  if (!atlas) return null;
  const supabase = createSupabaseServer();

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 space-y-8">
      <JournalInput slug={atlas.slug} />
      <AtlasDistillButton slug={atlas.slug} />
      <JournalTimeline initialEntries={(entries ?? []) as JournalEntry[]} />
    </div>
  );
}
