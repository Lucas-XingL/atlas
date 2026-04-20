import { NextResponse } from "next/server";
import { createSupabaseServiceRole } from "@/lib/supabase/server";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { distillJournal, type DistillInputEntry } from "@/lib/ai/distill";
import type { Atlas, Flashcard, JournalEntry } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ENTRIES_PER_BATCH = 20;

export async function POST(request: Request) {
  const auth = request.headers.get("x-cron-secret");
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRole();

  // Find (user, atlas) groups with raw journal entries
  const { data: pending, error } = await admin
    .from("journal_entries")
    .select("user_id, atlas_id")
    .eq("status", "raw")
    .not("atlas_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const groups = new Map<string, { user_id: string; atlas_id: string }>();
  for (const row of pending ?? []) {
    if (!row.atlas_id) continue;
    const key = `${row.user_id}:${row.atlas_id}`;
    if (!groups.has(key)) groups.set(key, { user_id: row.user_id, atlas_id: row.atlas_id });
  }

  const results: Array<{ atlas_id: string; cards: number; archived: number; error?: string }> = [];

  for (const { user_id, atlas_id } of groups.values()) {
    try {
      const summary = await distillOne(admin, user_id, atlas_id);
      results.push({ atlas_id, ...summary });
    } catch (err) {
      console.error("[cron/distill] group failed", { user_id, atlas_id, err });
      results.push({
        atlas_id,
        cards: 0,
        archived: 0,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({ groups: groups.size, results });
}

async function distillOne(
  admin: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  atlasId: string
): Promise<{ cards: number; archived: number }> {
  const { data: atlas } = await admin
    .from("atlases")
    .select("id, name, thesis")
    .eq("id", atlasId)
    .single<Atlas>();
  if (!atlas) return { cards: 0, archived: 0 };

  const { data: entries } = await admin
    .from("journal_entries")
    .select("id, text, created_at")
    .eq("atlas_id", atlasId)
    .eq("status", "raw")
    .order("created_at", { ascending: true })
    .limit(MAX_ENTRIES_PER_BATCH);

  if (!entries || entries.length === 0) return { cards: 0, archived: 0 };

  const { data: existing } = await admin
    .from("flashcards")
    .select("front, back")
    .eq("atlas_id", atlasId)
    .order("created_at", { ascending: false })
    .limit(30);

  const config = await resolveLlmConfig(admin, userId);

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

  // Insert new flashcards
  for (const card of result.cards) {
    const { data: inserted, error } = await admin
      .from("flashcards")
      .insert({
        atlas_id: atlasId,
        user_id: userId,
        front: card.front,
        back: card.back,
        origin_type: "journal",
        origin_refs: card.origin_ids,
        next_review_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      console.error("[cron/distill] insert card failed", { error });
      continue;
    }
    // Mark origin journal entries as distilled
    await admin
      .from("journal_entries")
      .update({
        status: "distilled",
        processed_at: new Date().toISOString(),
        ai_annotations: { flashcard_id: inserted.id },
      })
      .in("id", card.origin_ids);
  }

  // Archive entries the model judged unworthy
  if (result.archived_ids.length > 0) {
    await admin
      .from("journal_entries")
      .update({
        status: "archived",
        processed_at: new Date().toISOString(),
      })
      .in("id", result.archived_ids);
  }

  return { cards: result.cards.length, archived: result.archived_ids.length };
}
