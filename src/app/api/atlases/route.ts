import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  thesis: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET() {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("atlases")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ atlases: data });
}

export async function POST(request: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const baseSlug = slugify(parsed.data.name) || "atlas";
  const slug = await uniqueSlug(supabase, user.id, baseSlug);

  const { data, error } = await supabase
    .from("atlases")
    .insert({
      user_id: user.id,
      slug,
      name: parsed.data.name,
      thesis: parsed.data.thesis ?? null,
      tags: parsed.data.tags ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ atlas: data }, { status: 201 });
}

async function uniqueSlug(
  supabase: ReturnType<typeof createSupabaseServer>,
  userId: string,
  base: string
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabase
      .from("atlases")
      .select("id")
      .eq("user_id", userId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}
