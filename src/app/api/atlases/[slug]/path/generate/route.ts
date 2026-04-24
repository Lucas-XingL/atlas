import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { generateLearningPath } from "@/lib/ai/path-generator";
import type { Atlas } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * Generate a new learning path for the atlas.
 * Soft-deletes any existing active path (bumps its is_active to false).
 */
export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeSlug(params.slug);
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, name, thesis, tags")
    .eq("slug", slug)
    .maybeSingle<Pick<Atlas, "id" | "name" | "thesis" | "tags">>();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const llm = await resolveLlmConfig(supabase, user.id);
  const generated = await generateLearningPath(llm, atlas);

  // Find current version (for bumping) and deactivate old active path
  const { data: existingActive } = await supabase
    .from("learning_paths")
    .select("id, version")
    .eq("atlas_id", atlas.id)
    .eq("is_active", true)
    .maybeSingle();

  const nextVersion = (existingActive?.version ?? 0) + 1;

  if (existingActive) {
    await supabase
      .from("learning_paths")
      .update({ is_active: false })
      .eq("id", existingActive.id);
  }

  // Insert new path
  const { data: newPath, error: pathErr } = await supabase
    .from("learning_paths")
    .insert({
      atlas_id: atlas.id,
      user_id: user.id,
      version: nextVersion,
      overview: generated.overview,
      knowledge_domain: generated.knowledge_domain,
      is_active: true,
    })
    .select()
    .single();

  if (pathErr || !newPath) {
    return NextResponse.json({ error: pathErr?.message ?? "insert path failed" }, { status: 500 });
  }

  // Insert stages + resources
  for (let sIdx = 0; sIdx < generated.stages.length; sIdx++) {
    const stage = generated.stages[sIdx];
    const { data: stageRow, error: stageErr } = await supabase
      .from("path_stages")
      .insert({
        path_id: newPath.id,
        stage_order: sIdx,
        name: stage.name,
        intent: stage.intent,
        est_duration: stage.est_duration,
      })
      .select("id")
      .single();

    if (stageErr || !stageRow) {
      console.error("[path/generate] stage insert failed", stageErr);
      continue;
    }

    if (stage.resources.length === 0) continue;

    // The path generator no longer proposes URLs or resource types — the
    // user supplies the actual content when they click 开始读. Every
    // row is persisted as a neutral manual-entry placeholder.
    const resourceRows = stage.resources.map((r, rIdx) => ({
      stage_id: stageRow.id,
      res_order: rIdx,
      tier: r.tier,
      resource_type: "consumable" as const, // placeholder; user picks at accept
      title: r.title,
      url: null,
      author: r.author,
      why_relevant: r.why_relevant,
      search_hint: r.search_hint,
    }));

    const { error: resErr } = await supabase.from("path_resources").insert(resourceRows);
    if (resErr) console.error("[path/generate] resource insert failed", resErr);
  }

  // Update atlas.knowledge_domain if blank
  await supabase
    .from("atlases")
    .update({ knowledge_domain: generated.knowledge_domain })
    .eq("id", atlas.id)
    .is("knowledge_domain", null);

  return NextResponse.json({ path_id: newPath.id, stages: generated.stages.length });
}
