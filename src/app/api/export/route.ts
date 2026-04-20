import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Dump everything the user owns as a single JSON payload.
 * MVP-simple: one JSON file. Real zip/markdown export can come later.
 */
export async function GET() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: atlases }, { data: sources }, { data: journals }, { data: flashcards }, { data: digests }] =
    await Promise.all([
      supabase.from("atlases").select("*").eq("user_id", user.id),
      supabase.from("sources").select("*").eq("user_id", user.id),
      supabase.from("journal_entries").select("*").eq("user_id", user.id),
      supabase.from("flashcards").select("*").eq("user_id", user.id),
      supabase.from("digest_snapshots").select("*").eq("user_id", user.id),
    ]);

  const payload = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    atlases: atlases ?? [],
    sources: sources ?? [],
    journal_entries: journals ?? [],
    flashcards: flashcards ?? [],
    digests: digests ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="atlas-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
