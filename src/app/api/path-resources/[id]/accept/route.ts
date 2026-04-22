import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { detectSourceType } from "@/lib/fetch/web";
import { processSourceById } from "@/lib/pipeline/process-source";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/path-resources/[id]/accept
 *
 * Convert a suggested PathResource into an active Source:
 *  - consumable+url: insert source + run fetch+summarize synchronously (returns when ready/failed)
 *  - consumable w/o url, external, physical: insert placeholder source with fetch_status='pending'
 *    for users to later paste content via /api/sources/[id]/paste
 *
 * Also flips the resource user_status to 'reading' (or 'accepted' if no source yet) and
 * writes source_id back.
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

  const atlasId = (resource.stage as any)?.path?.atlas_id;
  if (!atlasId) return NextResponse.json({ error: "atlas lookup failed" }, { status: 500 });

  // Already accepted?
  if (resource.source_id) {
    return NextResponse.json({ source_id: resource.source_id, already_accepted: true });
  }

  const hasUrl = typeof resource.url === "string" && resource.url.length > 0;
  const isConsumable = resource.resource_type === "consumable";
  const isPhysical = resource.resource_type === "physical";

  // Create the source row
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

  // Link back + update status
  await supabase
    .from("path_resources")
    .update({
      source_id: src.id,
      user_status: isConsumable && hasUrl ? "reading" : "accepted",
    })
    .eq("id", resource.id);

  // Synchronously fetch + summarize if we can
  if (isConsumable && hasUrl) {
    const result = await processSourceById(supabase, src.id, user.id);
    if (!result.ok) {
      // Source row still exists with fetch_status='failed'; UI can offer paste/retry
      return NextResponse.json({
        source_id: src.id,
        fetch_ok: false,
        error: result.error,
      });
    }
  }

  return NextResponse.json({ source_id: src.id, fetch_ok: isConsumable && hasUrl });
}
