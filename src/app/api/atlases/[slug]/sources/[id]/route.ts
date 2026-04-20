import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["unread", "reading", "read", "dismissed"]).optional(),
  title: z.string().max(200).optional(),
});

export async function GET(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase.from("sources").select("*").eq("id", params.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ source: data });
}

export async function PATCH(request: Request, { params }: { params: { slug: string; id: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await supabase
    .from("sources")
    .update(parsed.data)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ source: data });
}

export async function DELETE(_req: Request, { params }: { params: { slug: string; id: string } }) {
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("sources").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
