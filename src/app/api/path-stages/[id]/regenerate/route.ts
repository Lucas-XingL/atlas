import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { generateStageResources } from "@/lib/ai/path-generator";
import type { Atlas } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = z.object({
  feedback: z.string().max(500).optional(),
});

/**
 * Regenerate the resources for a single stage, optionally guided by user
 * feedback (e.g. "资源太理论了，想要偏工程的").
 *
 * The stage's name / intent / est_duration is preserved; only its resources
 * are replaced. Path-level version and other stages are untouched.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const feedback = parsed.data.feedback?.trim() || null;

  // Load stage + its parent path + atlas + sibling stages
  const { data: stage } = await supabase
    .from("path_stages")
    .select("id, path_id, name, intent, est_duration")
    .eq("id", params.id)
    .maybeSingle();
  if (!stage) return NextResponse.json({ error: "stage not found" }, { status: 404 });

  const { data: path } = await supabase
    .from("learning_paths")
    .select("id, atlas_id, user_id")
    .eq("id", stage.path_id)
    .maybeSingle();
  if (!path || path.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, name, thesis, tags")
    .eq("id", path.atlas_id)
    .maybeSingle<Pick<Atlas, "id" | "name" | "thesis" | "tags">>();
  if (!atlas) return NextResponse.json({ error: "atlas missing" }, { status: 500 });

  const { data: siblings } = await supabase
    .from("path_stages")
    .select("id, name, intent, stage_order")
    .eq("path_id", path.id)
    .order("stage_order", { ascending: true });
  const siblingCtx = (siblings ?? [])
    .filter((s) => s.id !== stage.id)
    .map((s) => ({ name: s.name, intent: s.intent }));

  // Call the LLM
  const llm = await resolveLlmConfig(supabase, user.id);
  let resources;
  try {
    resources = await generateStageResources(llm, {
      atlas,
      stage: {
        name: stage.name,
        intent: stage.intent,
        est_duration: stage.est_duration,
      },
      sibling_stages: siblingCtx,
      feedback,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Replace the stage's resources atomically (best-effort; RLS guards cascade)
  const { error: delErr } = await supabase
    .from("path_resources")
    .delete()
    .eq("stage_id", stage.id);
  if (delErr) {
    return NextResponse.json({ error: `cleanup failed: ${delErr.message}` }, { status: 500 });
  }

  // The generator no longer guesses URLs or resource types — user supplies
  // the actual content at accept time.
  const rows = resources.map((r, idx) => ({
    stage_id: stage.id,
    res_order: idx,
    tier: r.tier,
    resource_type: "consumable" as const,
    title: r.title,
    url: null,
    author: r.author,
    why_relevant: r.why_relevant,
    search_hint: r.search_hint,
  }));

  const { error: insErr } = await supabase.from("path_resources").insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ stage_id: stage.id, resources_count: rows.length });
}
