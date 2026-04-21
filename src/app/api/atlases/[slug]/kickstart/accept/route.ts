import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { detectSourceType } from "@/lib/fetch/web";

export const runtime = "nodejs";

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

/**
 * Insert pending sources only. Client fires individual /api/sources/[id]/process
 * calls afterwards to drive fetch+summarize with live progress.
 */
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

  const rows = parsed.data.picks.map((p) => ({
    atlas_id: atlas.id,
    user_id: user.id,
    url: p.url,
    title: p.title,
    source_type: detectSourceType(p.url),
    status: "unread" as const,
    ai_recommended: true,
    fetch_status: "pending" as const,
    summary: p.why_relevant ? { why_relevant: p.why_relevant } : {},
  }));

  const { data: inserted, error } = await supabase
    .from("sources")
    .insert(rows)
    .select("id, url, title");

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 400 });
  }

  return NextResponse.json({ sources: inserted });
}
