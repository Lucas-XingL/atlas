import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { detectSourceType } from "@/lib/fetch/web";

export const runtime = "nodejs";

/**
 * POST /api/path-resources/[id]/accept
 *
 * Convert a suggested PathResource into an active Source row.
 *
 * New contract (iter 2):
 *   - Always returns `source_id` fast. Never blocks on fetching/summarizing.
 *   - The reader page is responsible for driving content ingestion:
 *       consumable+url → calls /api/sources/:id/process
 *       external/physical/no-url → shows "no raw content" reader mode
 *         where user can add per-item journal entries without raw text.
 *   - path_resources.user_status flips to 'accepted' (source created, no content yet).
 *     Once content lands the downstream paste/process pipelines bump it to 'reading'.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: resource } = await supabase
    .from("path_resources")
    .select("*, stage:path_stages(path_id, path:learning_paths(atlas_id))")
    .eq("id", params.id)
    .maybeSingle();
  if (!resource) return NextResponse.json({ error: "resource not found" }, { status: 404 });

  const atlasId = (resource.stage as { path?: { atlas_id?: string } } | null)?.path?.atlas_id;
  if (!atlasId) return NextResponse.json({ error: "atlas lookup failed" }, { status: 500 });

  // Already accepted? Return the existing source id.
  if (resource.source_id) {
    return NextResponse.json({ source_id: resource.source_id, already_accepted: true });
  }

  const hasUrl = typeof resource.url === "string" && resource.url.length > 0;
  const isPhysical = resource.resource_type === "physical";

  const { data: src, error: srcErr } = await supabase
    .from("sources")
    .insert({
      atlas_id: atlasId,
      user_id: user.id,
      url: resource.url,
      title: resource.title,
      author: resource.author,
      source_type: isPhysical ? "pdf" : hasUrl ? detectSourceType(resource.url) : "text",
      resource_type: resource.resource_type,
      path_resource_id: resource.id,
      status: "unread",
      ai_recommended: true,
      fetch_status: "pending",
      summary: resource.why_relevant ? { why_relevant: resource.why_relevant } : {},
    })
    .select()
    .single();

  if (srcErr || !src) {
    return NextResponse.json({ error: srcErr?.message ?? "insert source failed" }, { status: 500 });
  }

  await supabase
    .from("path_resources")
    .update({ source_id: src.id, user_status: "accepted" })
    .eq("id", resource.id);

  return NextResponse.json({ source_id: src.id });
}
