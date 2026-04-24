import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { fetchWebArticle } from "@/lib/fetch/web";
import { summarizeSource } from "@/lib/ai/summarize";

/**
 * Fetch the source URL, generate a summary, and persist both.
 * Preserves any existing why_relevant that was stored during kickstart.
 */
export async function processSourceById(
  supabase: SupabaseClient,
  sourceId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: src, error: fetchErr } = await supabase
    .from("sources")
    .select("id, url, summary, path_resource_id")
    .eq("id", sourceId)
    .maybeSingle();

  if (fetchErr || !src) {
    return { ok: false, error: fetchErr?.message ?? "source not found" };
  }
  if (!src.url) {
    return { ok: false, error: "source has no URL; use paste flow" };
  }

  try {
    await supabase.from("sources").update({ fetch_status: "fetching" }).eq("id", sourceId);
    const article = await fetchWebArticle(src.url);

    await supabase
      .from("sources")
      .update({
        fetch_status: "summarizing",
        title: article.title,
        raw_content: article.markdown,
        pub_date: article.pub_date,
        author: article.byline,
      })
      .eq("id", sourceId);

    const llm = await resolveLlmConfig(supabase, userId);
    const summary = await summarizeSource(llm, {
      title: article.title,
      url: src.url,
      markdown: article.markdown,
    });

    const whyRelevant = (src.summary as { why_relevant?: string } | null)?.why_relevant;
    const mergedSummary = { ...summary, ...(whyRelevant ? { why_relevant: whyRelevant } : {}) };

    await supabase
      .from("sources")
      .update({ summary: mergedSummary, fetch_status: "ready", fetch_error: null })
      .eq("id", sourceId);

    // Bump the linked path resource from 'accepted' to 'reading' now that
    // there's real content the user can start reading.
    if (src.path_resource_id) {
      await supabase
        .from("path_resources")
        .update({ user_status: "reading" })
        .eq("id", src.path_resource_id)
        .eq("user_status", "accepted");
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await supabase
      .from("sources")
      .update({ fetch_status: "failed", fetch_error: message.slice(0, 500) })
      .eq("id", sourceId);
    return { ok: false, error: message };
  }
}

/**
 * Summarize pasted raw text (no fetching).
 */
export async function summarizePastedText(
  supabase: SupabaseClient,
  sourceId: string,
  userId: string,
  args: { title?: string; text: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: src, error: fetchErr } = await supabase
    .from("sources")
    .select("id, url, title, summary, path_resource_id")
    .eq("id", sourceId)
    .maybeSingle();

  if (fetchErr || !src) {
    return { ok: false, error: fetchErr?.message ?? "source not found" };
  }

  try {
    const title = args.title?.trim() || src.title || args.text.slice(0, 60);

    await supabase
      .from("sources")
      .update({
        fetch_status: "summarizing",
        title,
        raw_content: args.text,
      })
      .eq("id", sourceId);

    const llm = await resolveLlmConfig(supabase, userId);
    const summary = await summarizeSource(llm, {
      title,
      url: src.url ?? null,
      markdown: args.text,
    });

    const whyRelevant = (src.summary as { why_relevant?: string } | null)?.why_relevant;
    const mergedSummary = { ...summary, ...(whyRelevant ? { why_relevant: whyRelevant } : {}) };

    await supabase
      .from("sources")
      .update({
        summary: mergedSummary,
        fetch_status: "ready",
        fetch_error: null,
        status: "reading",
      })
      .eq("id", sourceId);

    // Bump the linked path resource from 'accepted' to 'reading' now that there's real content.
    if (src.path_resource_id) {
      await supabase
        .from("path_resources")
        .update({ user_status: "reading" })
        .eq("id", src.path_resource_id)
        .eq("user_status", "accepted");
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await supabase
      .from("sources")
      .update({ fetch_status: "failed", fetch_error: message.slice(0, 500) })
      .eq("id", sourceId);
    return { ok: false, error: message };
  }
}
