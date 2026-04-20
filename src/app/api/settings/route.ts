import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  morning_ritual_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  llm_provider: z.enum(["zhipu", "minimax"]).optional(),
  llm_model_quality: z.string().max(80).nullable().optional(),
  llm_model_fast: z.string().max(80).nullable().optional(),
  llm_api_key: z.string().max(200).nullable().optional(),
  minimax_group_id: z.string().max(120).nullable().optional(),
  email_push_enabled: z.boolean().optional(),
});

export async function GET() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Never leak the api_key to the client; just signal whether one is set
  const safe = data
    ? { ...data, llm_api_key: data.llm_api_key ? "***" : null }
    : null;
  return NextResponse.json({ settings: safe });
}

export async function PATCH(request: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  // If the caller passed "***" sentinel back, drop it so we don't clobber.
  const update = { ...parsed.data };
  if (update.llm_api_key === "***") delete update.llm_api_key;

  const { data, error } = await supabase
    .from("user_settings")
    .update(update)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    settings: { ...data, llm_api_key: data.llm_api_key ? "***" : null },
  });
}
