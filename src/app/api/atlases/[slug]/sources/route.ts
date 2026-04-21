import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { detectSourceType } from "@/lib/fetch/web";
import { processSourceById, summarizePastedText } from "@/lib/pipeline/process-source";

export const runtime = "nodejs";
export const maxDuration = 60;

const postSchema = z.union([
  z.object({ url: z.string().url() }),
  z.object({ text: z.string().min(20).max(200_000), title: z.string().min(1).max(200).optional() }),
]);

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("ingested_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ sources: data });
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const input = parsed.data;
  const isUrl = "url" in input;
  const initialTitle = isUrl ? input.url : input.title?.trim() || input.text.slice(0, 60);

  const { data: inserted, error: insertErr } = await supabase
    .from("sources")
    .insert({
      atlas_id: atlas.id,
      user_id: user.id,
      url: isUrl ? input.url : null,
      title: initialTitle,
      source_type: isUrl ? detectSourceType(input.url) : "text",
      status: "unread",
      fetch_status: "pending",
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? "insert failed" }, { status: 400 });
  }

  // Synchronously process so the response reflects the real outcome.
  // Vercel serverless will not reliably run anything after the response is sent.
  const result = isUrl
    ? await processSourceById(supabase, inserted.id, user.id)
    : await summarizePastedText(supabase, inserted.id, user.id, {
        text: input.text,
        title: input.title,
      });

  const { data: finalSource } = await supabase
    .from("sources")
    .select("*")
    .eq("id", inserted.id)
    .single();

  const status = result.ok ? 201 : 200; // 200 even on processing failure — the row exists
  return NextResponse.json({ source: finalSource }, { status });
}
