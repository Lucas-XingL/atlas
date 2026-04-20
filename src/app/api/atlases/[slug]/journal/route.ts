import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const postSchema = z.object({
  text: z.string().min(1).max(4000),
});

async function resolveAtlas(
  supabase: ReturnType<typeof createSupabaseServer>,
  slug: string
) {
  const { data } = await supabase.from("atlases").select("id, user_id").eq("slug", slug).maybeSingle();
  return data;
}

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const supabase = createSupabaseServer();
  const atlas = await resolveAtlas(supabase, params.slug);
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Number(searchParams.get("limit") ?? 50));

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entries: data });
}

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const atlas = await resolveAtlas(supabase, params.slug);
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      atlas_id: atlas.id,
      user_id: user.id,
      text: parsed.data.text.trim(),
      channel: "web",
      status: "raw",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
