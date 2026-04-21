import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchAndParseFeed } from "@/lib/feed/rss";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, feed_url, user_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const feed = await fetchAndParseFeed(sub.feed_url);

    // Dedup against known external_ids
    const { data: known } = await supabase
      .from("subscription_items")
      .select("external_id")
      .eq("subscription_id", sub.id);
    const knownSet = new Set((known ?? []).map((r) => r.external_id));

    const newItems = feed.items
      .filter((it) => !knownSet.has(it.external_id))
      .slice(0, 50)
      .map((it) => ({
        subscription_id: sub.id,
        user_id: sub.user_id,
        external_id: it.external_id,
        title: it.title,
        url: it.url,
        author: it.author,
        published_at: it.published_at,
        summary_preview: it.summary_preview,
      }));

    if (newItems.length > 0) {
      await supabase.from("subscription_items").insert(newItems);
    }

    await supabase
      .from("subscriptions")
      .update({ last_fetched_at: new Date().toISOString(), last_error: null })
      .eq("id", sub.id);

    return NextResponse.json({ new_items: newItems.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await supabase
      .from("subscriptions")
      .update({ last_error: message.slice(0, 500), last_fetched_at: new Date().toISOString() })
      .eq("id", sub.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
