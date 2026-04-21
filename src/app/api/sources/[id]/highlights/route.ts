import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const postSchema = z.object({
  text: z.string().min(1).max(10_000),
  start_offset: z.number().int().min(0),
  end_offset: z.number().int().min(1),
  note: z.string().max(2000).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("highlights")
    .select("*")
    .eq("source_id", params.id)
    .order("start_offset", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ highlights: data });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  if (parsed.data.end_offset <= parsed.data.start_offset) {
    return NextResponse.json({ error: "end_offset must be > start_offset" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("highlights")
    .insert({
      source_id: params.id,
      user_id: user.id,
      text: parsed.data.text,
      start_offset: parsed.data.start_offset,
      end_offset: parsed.data.end_offset,
      note: parsed.data.note ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ highlight: data }, { status: 201 });
}
