import { NextResponse } from "next/server";
import { createSupabaseServiceRole } from "@/lib/supabase/server";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { generateWeeklyDigest } from "@/lib/ai/distill";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = request.headers.get("x-cron-secret");
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRole();
  const { data: atlases } = await admin
    .from("atlases")
    .select("id, user_id, name, thesis")
    .eq("status", "active");

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 86_400_000);
  const isoStart = periodStart.toISOString();
  const isoEnd = periodEnd.toISOString();

  const results: Array<{ atlas_id: string; ok: boolean; error?: string }> = [];

  for (const atlas of atlases ?? []) {
    try {
      await digestOne(admin, atlas, isoStart, isoEnd);
      results.push({ atlas_id: atlas.id, ok: true });
    } catch (err) {
      results.push({
        atlas_id: atlas.id,
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({ atlases: atlases?.length ?? 0, results });
}

async function digestOne(
  admin: ReturnType<typeof createSupabaseServiceRole>,
  atlas: { id: string; user_id: string; name: string; thesis: string | null },
  isoStart: string,
  isoEnd: string
) {
  const [
    { data: journals, count: journalCount },
    { data: cards, count: cardCount },
    { data: sources, count: sourceCount },
    { count: reviews },
  ] = await Promise.all([
    admin
      .from("journal_entries")
      .select("text", { count: "exact" })
      .eq("atlas_id", atlas.id)
      .gte("created_at", isoStart)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("flashcards")
      .select("front, back, success_count", { count: "exact" })
      .eq("atlas_id", atlas.id)
      .gte("created_at", isoStart)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("sources")
      .select("title", { count: "exact" })
      .eq("atlas_id", atlas.id)
      .eq("status", "read")
      .gte("ingested_at", isoStart)
      .limit(20),
    admin
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("atlas_id", atlas.id)
      .gte("updated_at", isoStart)
      .gt("review_count", 0),
  ]);

  const stats = {
    journal_count: journalCount ?? 0,
    new_cards: cardCount ?? 0,
    sources_read: sourceCount ?? 0,
    reviews: reviews ?? 0,
    retention_rate: 0,
  };

  // If truly empty, skip
  if (stats.journal_count === 0 && stats.new_cards === 0 && stats.sources_read === 0) {
    return;
  }

  const config = await resolveLlmConfig(admin, atlas.user_id);
  const markdown = await generateWeeklyDigest(config, {
    atlas: { name: atlas.name, thesis: atlas.thesis },
    period_start: isoStart.slice(0, 10),
    period_end: isoEnd.slice(0, 10),
    stats,
    journal_samples: (journals ?? []).map((j) => j.text),
    card_samples: (cards ?? []).map((c) => ({
      front: c.front,
      back: c.back,
      success_count: c.success_count,
    })),
    source_titles: (sources ?? []).map((s) => s.title),
  });

  await admin.from("digest_snapshots").insert({
    atlas_id: atlas.id,
    user_id: atlas.user_id,
    period: "weekly",
    period_start: isoStart.slice(0, 10),
    period_end: isoEnd.slice(0, 10),
    content: { markdown, stats },
  });
}
