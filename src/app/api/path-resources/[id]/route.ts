import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  tier: z.enum(["core", "extra"]).optional(),
  resource_type: z.enum(["consumable", "external", "physical"]).optional(),
  url: z.string().url().nullable().optional(),
  author: z.string().max(100).nullable().optional(),
  why_relevant: z.string().max(400).nullable().optional(),
  search_hint: z.string().max(200).nullable().optional(),
  user_status: z.enum(["suggested", "accepted", "reading", "finished", "skipped"]).optional(),
  source_id: z.string().uuid().nullable().optional(),
  res_order: z.number().int().min(0).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("path_resources")
    .update(parsed.data)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ resource: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("path_resources").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
