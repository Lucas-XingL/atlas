import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";

export const runtime = "nodejs";

/**
 * GET /api/atlases/[slug]/path
 *
 * Returns the active learning path with nested stages + resources,
 * or 404 if no active path exists.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: path } = await supabase
    .from("learning_paths")
    .select("*")
    .eq("atlas_id", atlas.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!path) return NextResponse.json({ path: null });

  const { data: stages } = await supabase
    .from("path_stages")
    .select("*")
    .eq("path_id", path.id)
    .order("stage_order", { ascending: true });

  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: resources } = stageIds.length
    ? await supabase
        .from("path_resources")
        .select("*")
        .in("stage_id", stageIds)
        .order("res_order", { ascending: true })
    : { data: [] as any[] };

  const byStage = new Map<string, any[]>();
  for (const r of resources ?? []) {
    const arr = byStage.get(r.stage_id) ?? [];
    arr.push(r);
    byStage.set(r.stage_id, arr);
  }

  const nested = {
    ...path,
    stages: (stages ?? []).map((s) => ({
      ...s,
      resources: byStage.get(s.id) ?? [],
    })),
  };

  return NextResponse.json({ path: nested });
}
