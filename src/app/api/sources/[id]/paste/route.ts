import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { summarizePastedText } from "@/lib/pipeline/process-source";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  text: z.string().min(20).max(200_000),
  title: z.string().min(1).max(300).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const result = await summarizePastedText(supabase, params.id, user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { data } = await supabase
    .from("sources")
    .select("id, title, fetch_status, fetch_error, summary")
    .eq("id", params.id)
    .maybeSingle();

  return NextResponse.json({ source: data });
}
