import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const postSchema = z.object({
  title: z.string().min(1).max(200),
  tier: z.enum(["core", "extra"]).default("core"),
  resource_type: z.enum(["consumable", "external", "physical"]).default("consumable"),
  url: z.string().url().nullable().optional(),
  author: z.string().max(100).nullable().optional(),
  why_relevant: z.string().max(400).nullable().optional(),
  search_hint: z.string().max(200).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { count } = await supabase
    .from("path_resources")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", params.id);

  const { data, error } = await supabase
    .from("path_resources")
    .insert({
      stage_id: params.id,
      res_order: count ?? 0,
      ...parsed.data,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ resource: data });
}
