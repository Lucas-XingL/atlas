import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchSchema = z.object({
  user_status: z.enum(["new", "in_pool", "skipped"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await supabase
    .from("subscription_items")
    .update(parsed.data)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}
