import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { distillJournal, type DistillInputEntry } from "@/lib/ai/distill";
import type { Atlas, Flashcard } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Manual trigger: run distill right now for a single atlas (the current user).
 * Useful for dev and for the "Run distill now" button.
 */
export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, name, thesis")
    .eq("slug", decodeSlug(params.slug))
    .single<Pick<Atlas, "id" | "name" | "thesis">>();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, text, created_at")
    .eq("atlas_id", atlas.id)
    .eq("status", "raw")
    .order("created_at", { ascending: true })
    .limit(20);

  if (!entries || entries.length === 0) {
    return NextResponse.json({ cards: 0, archived: 0, note: "no raw entries" });
  }

  const { data: existing } = await supabase
    .from("flashcards")
    .select("front, back")
    .eq("atlas_id", atlas.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const config = await resolveLlmConfig(supabase, user.id);

  const input: DistillInputEntry[] = entries.map((e) => ({
    id: e.id,
    text: e.text,
    created_at: e.created_at,
  }));

  const result = await distillJournal(
    config,
    atlas,
    input,
    (existing ?? []) as Array<Pick<Flashcard, "front" | "back">>
  );

  for (const card of result.cards) {
    const { data: inserted } = await supabase
      .from("flashcards")
      .insert({
        atlas_id: atlas.id,
        user_id: user.id,
        front: card.front,
        back: card.back,
        origin_type: "journal",
        origin_refs: card.origin_ids,
        next_review_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (inserted) {
      await supabase
        .from("journal_entries")
        .update({
          status: "distilled",
          processed_at: new Date().toISOString(),
          ai_annotations: { flashcard_id: inserted.id },
        })
        .in("id", card.origin_ids);
    }
  }

  if (result.archived_ids.length > 0) {
    await supabase
      .from("journal_entries")
      .update({
        status: "archived",
        processed_at: new Date().toISOString(),
      })
      .in("id", result.archived_ids);
  }

  return NextResponse.json({
    cards: result.cards.length,
    archived: result.archived_ids.length,
  });
}
