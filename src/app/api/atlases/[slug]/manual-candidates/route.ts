import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";

export const runtime = "nodejs";

const postSchema = z.union([
  z.object({
    url: z.string().url(),
    title: z.string().min(1).max(300).optional(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    text_snippet: z.string().min(20).max(50_000),
    title: z.string().min(1).max(300).optional(),
    note: z.string().max(500).optional(),
  }),
]);

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("manual_candidates")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ candidates: data });
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const input = parsed.data;
  const title =
    input.title?.trim() ||
    ("url" in input ? input.url : input.text_snippet.slice(0, 60));

  const row = {
    atlas_id: atlas.id,
    user_id: user.id,
    url: "url" in input ? input.url : null,
    text_snippet: "text_snippet" in input ? input.text_snippet : null,
    title,
    note: input.note ?? null,
  };

  const { data, error } = await supabase
    .from("manual_candidates")
    .insert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ candidate: data }, { status: 201 });
}
