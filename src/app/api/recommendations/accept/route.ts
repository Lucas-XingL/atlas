import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { detectSourceType } from "@/lib/fetch/web";
import { processSourceById, summarizePastedText } from "@/lib/pipeline/process-source";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  origin: z.enum(["path", "subscription", "manual"]),
  ref_id: z.string().uuid(),
});

/**
 * Unified candidate → pool accept endpoint.
 * Delegates to the right path based on origin.
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { origin, ref_id } = parsed.data;

  if (origin === "path") {
    return acceptPathResource(supabase, user.id, ref_id);
  }
  if (origin === "subscription") {
    return acceptSubscriptionItem(supabase, user.id, ref_id);
  }
  return acceptManualCandidate(supabase, user.id, ref_id);
}

async function acceptPathResource(
  supabase: ReturnType<typeof createSupabaseServer>,
  userId: string,
  resourceId: string
) {
  const { data: resource } = await supabase
    .from("path_resources")
    .select("*, stage:path_stages(path_id, path:learning_paths(atlas_id))")
    .eq("id", resourceId)
    .maybeSingle();
  if (!resource) return NextResponse.json({ error: "resource not found" }, { status: 404 });

  const atlasId = (resource.stage as any)?.path?.atlas_id;
  if (!atlasId) return NextResponse.json({ error: "atlas lookup failed" }, { status: 500 });

  if (resource.source_id) {
    return NextResponse.json({ source_id: resource.source_id, already: true });
  }

  const hasUrl = typeof resource.url === "string" && resource.url.length > 0;
  const isConsumable = resource.resource_type === "consumable";

  const { data: src, error } = await supabase
    .from("sources")
    .insert({
      atlas_id: atlasId,
      user_id: userId,
      url: resource.url,
      title: resource.title,
      author: resource.author,
      source_type: hasUrl ? detectSourceType(resource.url) : "text",
      resource_type: resource.resource_type,
      path_resource_id: resource.id,
      origin: "path",
      origin_ref: resource.id,
      status: "unread",
      ai_recommended: true,
      fetch_status: "pending",
      summary: resource.why_relevant ? { why_relevant: resource.why_relevant } : {},
    })
    .select()
    .single();

  if (error || !src) {
    return NextResponse.json({ error: error?.message ?? "insert source failed" }, { status: 500 });
  }

  await supabase
    .from("path_resources")
    .update({
      source_id: src.id,
      user_status: isConsumable && hasUrl ? "reading" : "accepted",
    })
    .eq("id", resource.id);

  if (isConsumable && hasUrl) {
    const result = await processSourceById(supabase, src.id, userId);
    if (!result.ok) {
      return NextResponse.json({ source_id: src.id, fetch_ok: false, error: result.error });
    }
  }

  return NextResponse.json({ source_id: src.id, fetch_ok: isConsumable && hasUrl });
}

async function acceptSubscriptionItem(
  supabase: ReturnType<typeof createSupabaseServer>,
  userId: string,
  itemId: string
) {
  const { data: item } = await supabase
    .from("subscription_items")
    .select("*, subscription:subscriptions(id, atlas_id, title)")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "item not found" }, { status: 404 });

  const atlasId = (item.subscription as any)?.atlas_id;
  if (!atlasId) return NextResponse.json({ error: "atlas lookup failed" }, { status: 500 });

  if (item.source_id) {
    return NextResponse.json({ source_id: item.source_id, already: true });
  }

  const { data: src, error } = await supabase
    .from("sources")
    .insert({
      atlas_id: atlasId,
      user_id: userId,
      url: item.url,
      title: item.title,
      author: item.author,
      pub_date: item.published_at ? (item.published_at as string).slice(0, 10) : null,
      source_type: item.url ? detectSourceType(item.url) : "text",
      resource_type: "consumable",
      origin: "subscription",
      origin_ref: item.id,
      status: "unread",
      fetch_status: "pending",
      summary: item.summary_preview ? { tl_dr: item.summary_preview } : {},
    })
    .select()
    .single();

  if (error || !src) {
    return NextResponse.json({ error: error?.message ?? "insert source failed" }, { status: 500 });
  }

  await supabase
    .from("subscription_items")
    .update({ user_status: "in_pool", source_id: src.id })
    .eq("id", item.id);

  if (item.url) {
    const result = await processSourceById(supabase, src.id, userId);
    if (!result.ok) {
      return NextResponse.json({ source_id: src.id, fetch_ok: false, error: result.error });
    }
  }

  return NextResponse.json({ source_id: src.id, fetch_ok: Boolean(item.url) });
}

async function acceptManualCandidate(
  supabase: ReturnType<typeof createSupabaseServer>,
  userId: string,
  candidateId: string
) {
  const { data: cand } = await supabase
    .from("manual_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) return NextResponse.json({ error: "candidate not found" }, { status: 404 });

  const { data: src, error } = await supabase
    .from("sources")
    .insert({
      atlas_id: cand.atlas_id,
      user_id: userId,
      url: cand.url,
      title: cand.title,
      source_type: cand.url ? detectSourceType(cand.url) : "text",
      resource_type: "consumable",
      origin: "manual",
      origin_ref: cand.id,
      status: "unread",
      fetch_status: "pending",
      summary: cand.note ? { why_relevant: cand.note } : {},
    })
    .select()
    .single();

  if (error || !src) {
    return NextResponse.json({ error: error?.message ?? "insert source failed" }, { status: 500 });
  }

  // If user pasted raw text snippet, use summarizePastedText path; else if url, fetch
  if (cand.url) {
    const result = await processSourceById(supabase, src.id, userId);
    if (!result.ok) {
      return NextResponse.json({ source_id: src.id, fetch_ok: false, error: result.error });
    }
  } else if (cand.text_snippet) {
    const result = await summarizePastedText(supabase, src.id, userId, {
      title: cand.title,
      text: cand.text_snippet,
    });
    if (!result.ok) {
      return NextResponse.json({ source_id: src.id, fetch_ok: false, error: result.error });
    }
  }

  // Manual candidate's life is over once in pool
  await supabase.from("manual_candidates").delete().eq("id", cand.id);

  return NextResponse.json({ source_id: src.id, fetch_ok: Boolean(cand.url || cand.text_snippet) });
}
