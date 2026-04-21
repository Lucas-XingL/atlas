import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { processSourceById } from "@/lib/pipeline/process-source";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Synchronously fetch + summarize a single source.
 * Client uses this after /kickstart/accept to drive live progress.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await processSourceById(supabase, params.id, user.id);

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
