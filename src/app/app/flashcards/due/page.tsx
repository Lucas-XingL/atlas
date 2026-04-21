import { createSupabaseServer } from "@/lib/supabase/server";
import { ReviewSession } from "@/components/review-session";

export const dynamic = "force-dynamic";

export default async function DuePage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  const supabase = createSupabaseServer();
  const { data: cards } = await supabase
    .from("flashcards")
    .select("*, atlas:atlases(slug, name)")
    .lte("next_review_at", new Date(Date.now() + 4 * 3600_000).toISOString())
    .order("next_review_at", { ascending: true })
    .limit(20);

  return (
    <div className="mx-auto max-w-2xl px-8 py-14">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">今日复习</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          快速过一遍 · remembered 延长间隔 · forgot 重置
        </p>
      </div>
      <ReviewSession initial={(cards ?? []) as any} backTo={searchParams.from ?? null} />
    </div>
  );
}
