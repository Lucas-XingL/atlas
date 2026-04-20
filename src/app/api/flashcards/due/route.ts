import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createSupabaseServer();
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("atlas_slug");
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 20));

  let query = supabase
    .from("flashcards")
    .select("*, atlas:atlases(slug, name)")
    .lte("next_review_at", new Date(Date.now() + 4 * 3600_000).toISOString())
    .order("next_review_at", { ascending: true })
    .limit(limit);

  if (slug) {
    const { data: atlas } = await supabase.from("atlases").select("id").eq("slug", slug).maybeSingle();
    if (!atlas) return NextResponse.json({ cards: [] });
    query = query.eq("atlas_id", atlas.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ cards: data });
}
