import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  thesis: z.string().max(500).nullable().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("atlases")
    .select("*")
    .eq("slug", decodeSlug(params.slug))
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ atlas: data });
}

export async function PATCH(request: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("atlases")
    .update(parsed.data)
    .eq("slug", decodeSlug(params.slug))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ atlas: data });
}

export async function DELETE(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const { error } = await supabase
    .from("atlases")
    .update({ status: "archived" })
    .eq("slug", decodeSlug(params.slug));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
