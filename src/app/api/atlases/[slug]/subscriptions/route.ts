import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { fetchAndParseFeed } from "@/lib/feed/rss";

export const runtime = "nodejs";
export const maxDuration = 30;

const postSchema = z.object({
  feed_url: z.string().url(),
  title_override: z.string().max(200).optional(),
});

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ subscriptions: data });
}

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Validate feed + pull the first batch of items in one go
  let feed;
  try {
    feed = await fetchAndParseFeed(parsed.data.feed_url);
  } catch (err) {
    return NextResponse.json(
      { error: `feed 解析失败: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 }
    );
  }

  const { data: sub, error: insertErr } = await supabase
    .from("subscriptions")
    .insert({
      atlas_id: atlas.id,
      user_id: user.id,
      feed_url: parsed.data.feed_url,
      title: parsed.data.title_override || feed.title,
      site_url: feed.site_url,
      last_fetched_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (insertErr || !sub) {
    return NextResponse.json({ error: insertErr?.message ?? "insert failed" }, { status: 400 });
  }

  // Seed initial items (cap to recent 20 so first load isn't overwhelming)
  if (feed.items.length > 0) {
    const rows = feed.items.slice(0, 20).map((it) => ({
      subscription_id: sub.id,
      user_id: user.id,
      external_id: it.external_id,
      title: it.title,
      url: it.url,
      author: it.author,
      published_at: it.published_at,
      summary_preview: it.summary_preview,
    }));
    await supabase.from("subscription_items").insert(rows);
  }

  return NextResponse.json({ subscription: sub, seeded: Math.min(feed.items.length, 20) });
}
