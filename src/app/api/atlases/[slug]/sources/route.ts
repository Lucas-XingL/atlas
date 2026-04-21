import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { fetchWebArticle, detectSourceType } from "@/lib/fetch/web";
import { summarizeSource } from "@/lib/ai/summarize";

export const runtime = "nodejs";
export const maxDuration = 60;

const postSchema = z.union([
  z.object({ url: z.string().url() }),
  z.object({ text: z.string().min(20).max(200_000), title: z.string().min(1).max(200).optional() }),
]);

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase.from("atlases").select("id").eq("slug", decodeSlug(params.slug)).maybeSingle();
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

  const { data: atlas } = await supabase.from("atlases").select("id").eq("slug", decodeSlug(params.slug)).maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const input = parsed.data;
  let initialTitle: string;
  let initialUrl: string | null;
  let initialType: "web" | "arxiv" | "pdf" | "video" | "text";
  if ("url" in input) {
    initialTitle = input.url;
    initialUrl = input.url;
    initialType = detectSourceType(input.url);
  } else {
    initialTitle = input.title?.trim() || input.text.slice(0, 60);
    initialUrl = null;
    initialType = "text";
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("sources")
    .insert({
      atlas_id: atlas.id,
      user_id: user.id,
      url: initialUrl,
      title: initialTitle,
      source_type: initialType,
      status: "unread",
      fetch_status: "pending",
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? "insert failed" }, { status: 400 });
  }

  // Fire-and-forget. Use service role so the async task isn't affected by cookie lifecycle.
  const sourceId = inserted.id;
  void processSource(sourceId, user.id, input).catch((err) => {
    console.error("[sources] processSource failed", { sourceId, err });
  });

  return NextResponse.json({ source: inserted }, { status: 201 });
}

async function processSource(
  sourceId: string,
  userId: string,
  input: z.infer<typeof postSchema>
) {
  const admin = createSupabaseServiceRole();

  try {
    await admin.from("sources").update({ fetch_status: "fetching" }).eq("id", sourceId);

    let title = "";
    let markdown = "";
    let pub_date: string | null = null;
    let author: string | null = null;

    if ("url" in input) {
      const article = await fetchWebArticle(input.url);
      title = article.title;
      markdown = article.markdown;
      pub_date = article.pub_date;
      author = article.byline;
    } else {
      title = input.title?.trim() || input.text.slice(0, 60);
      markdown = input.text;
    }

    await admin
      .from("sources")
      .update({
        fetch_status: "summarizing",
        title,
        raw_content: markdown,
        pub_date,
        author,
      })
      .eq("id", sourceId);

    // Re-use server client configured for service role to read user_settings
    const config = await resolveLlmConfig(admin, userId);
    const summary = await summarizeSource(config, {
      title,
      url: "url" in input ? input.url : null,
      markdown,
    });

    await admin
      .from("sources")
      .update({
        summary,
        fetch_status: "ready",
        fetch_error: null,
      })
      .eq("id", sourceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[sources] processSource error", { sourceId, message });
    await admin
      .from("sources")
      .update({
        fetch_status: "failed",
        fetch_error: message.slice(0, 500),
      })
      .eq("id", sourceId);
  }
}
