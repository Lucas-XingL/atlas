import { createSupabaseServer } from "@/lib/supabase/server";
import { ReviewSession } from "@/components/review-session";

export const dynamic = "force-dynamic";

export default async function DuePage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  const supabase = createSupabaseServer();
  const nowCutoff = new Date(Date.now() + 4 * 3600_000).toISOString();

  const [{ data: cards }, { data: nextCard }] = await Promise.all([
    supabase
      .from("flashcards")
      .select("*, atlas:atlases(slug, name)")
      .lte("next_review_at", nowCutoff)
      .order("next_review_at", { ascending: true })
      .limit(20),
    supabase
      .from("flashcards")
      .select("next_review_at, atlas:atlases(slug, name)")
      .gt("next_review_at", nowCutoff)
      .order("next_review_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-8 py-14">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">今日复习</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          快速过一遍 · 记得 延长间隔 · 忘了 重置
        </p>
      </div>
      <ReviewSession
        initial={(cards ?? []) as any}
        backTo={searchParams.from ?? null}
        nextDueAt={nextCard?.next_review_at ?? null}
      />
    </div>
  );
}
