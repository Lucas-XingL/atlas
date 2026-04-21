import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Convert an existing highlight into a journal_entry, linking back.
 * Idempotent: if the highlight already has journal_entry_id, returns it.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: h, error: hErr } = await supabase
    .from("highlights")
    .select("id, source_id, text, journal_entry_id, source:sources(atlas_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (hErr || !h) return NextResponse.json({ error: "highlight not found" }, { status: 404 });

  if (h.journal_entry_id) {
    return NextResponse.json({ journal_entry_id: h.journal_entry_id, already: true });
  }

  const source = Array.isArray(h.source) ? h.source[0] : h.source;
  const atlasId = (source as { atlas_id?: string } | null)?.atlas_id;
  if (!atlasId) return NextResponse.json({ error: "atlas lookup failed" }, { status: 500 });

  const { data: entry, error: jErr } = await supabase
    .from("journal_entries")
    .insert({
      atlas_id: atlasId,
      user_id: user.id,
      text: h.text,
      channel: "highlight",
      source_ref: h.source_id,
      status: "raw",
    })
    .select("id")
    .single();

  if (jErr || !entry) return NextResponse.json({ error: jErr?.message ?? "insert failed" }, { status: 500 });

  await supabase
    .from("highlights")
    .update({ journal_entry_id: entry.id })
    .eq("id", h.id);

  return NextResponse.json({ journal_entry_id: entry.id });
}
