import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * DELETE a raw journal entry. RLS enforces user_id scoping.
 * Only allows deletion of raw entries — once they've been distilled into a
 * flashcard we shouldn't orphan the card's origin ref.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle<{ id: string; status: string }>();

  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (entry.status !== "raw") {
    return NextResponse.json(
      { error: "already distilled, cannot delete" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("journal_entries").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
