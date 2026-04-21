import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { fetchWebArticle, detectSourceType } from "@/lib/fetch/web";
import { summarizeSource } from "@/lib/ai/summarize";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  picks: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string().min(1).max(300),
        why_relevant: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request, { params }: { params: { slug: string } }) {
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

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Insert all picks as pending sources
  const rows = parsed.data.picks.map((p) => ({
    atlas_id: atlas.id,
    user_id: user.id,
    url: p.url,
    title: p.title,
    source_type: detectSourceType(p.url),
    status: "unread" as const,
    ai_recommended: true,
    fetch_status: "pending" as const,
    summary: p.why_relevant ? { tl_dr: p.why_relevant } : {},
  }));

  const { data: inserted, error } = await supabase
    .from("sources")
    .insert(rows)
    .select("id, url");
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 400 });
  }

  // Fire-and-forget: fetch & summarize each source in background.
  for (const row of inserted) {
    if (!row.url) continue;
    void processSource(row.id, row.url, user.id).catch((err) =>
      console.error("[kickstart/accept] bg failed", { id: row.id, err })
    );
  }

  return NextResponse.json({ inserted: inserted.length });
}

async function processSource(sourceId: string, url: string, userId: string) {
  const admin = createSupabaseServiceRole();
  try {
    await admin.from("sources").update({ fetch_status: "fetching" }).eq("id", sourceId);
    const article = await fetchWebArticle(url);
    await admin
      .from("sources")
      .update({
        fetch_status: "summarizing",
        title: article.title,
        raw_content: article.markdown,
        pub_date: article.pub_date,
        author: article.byline,
      })
      .eq("id", sourceId);

    const llm = await resolveLlmConfig(admin, userId);
    const summary = await summarizeSource(llm, {
      title: article.title,
      url,
      markdown: article.markdown,
    });
    // Preserve the why_relevant we stored earlier under a separate field.
    const { data: existing } = await admin
      .from("sources")
      .select("summary")
      .eq("id", sourceId)
      .single();
    const prevWhy = (existing?.summary as { tl_dr?: string } | null)?.tl_dr;
    const mergedSummary = {
      ...summary,
      why_relevant: prevWhy ?? undefined,
    };

    await admin
      .from("sources")
      .update({ summary: mergedSummary, fetch_status: "ready", fetch_error: null })
      .eq("id", sourceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await admin
      .from("sources")
      .update({ fetch_status: "failed", fetch_error: message.slice(0, 500) })
      .eq("id", sourceId);
  }
}
