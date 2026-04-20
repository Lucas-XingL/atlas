import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { applySm2 } from "@/lib/sr/sm2";
import type { Flashcard } from "@/lib/types";

export const runtime = "nodejs";

const postSchema = z.object({
  rating: z.enum(["remembered", "foggy", "forgot"]),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: card, error: fetchErr } = await supabase
    .from("flashcards")
    .select("*")
    .eq("id", params.id)
    .single<Flashcard>();
  if (fetchErr || !card) return NextResponse.json({ error: "not found" }, { status: 404 });

  const next = applySm2(card, parsed.data.rating);

  const { data, error } = await supabase
    .from("flashcards")
    .update(next)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ card: data });
}
