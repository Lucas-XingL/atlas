import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";

export const runtime = "nodejs";

/**
 * Aggregate the three source pipelines into candidate lists for the
 * /recommendations page:
 *   - path: PathResources with user_status='suggested'
 *   - subscription: SubscriptionItems with user_status='new'
 *   - manual: ManualCandidates (all of them are candidates by definition)
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const slug = decodeSlug(params.slug);
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Path candidates: resources still in suggested state, grouped by stage
  const { data: activePath } = await supabase
    .from("learning_paths")
    .select("id")
    .eq("atlas_id", atlas.id)
    .eq("is_active", true)
    .maybeSingle();

  let pathCandidates: any[] = [];
  if (activePath) {
    const { data: stages } = await supabase
      .from("path_stages")
      .select("id, name, stage_order, intent")
      .eq("path_id", activePath.id)
      .order("stage_order", { ascending: true });

    const stageIds = (stages ?? []).map((s) => s.id);
    const { data: resources } =
      stageIds.length > 0
        ? await supabase
            .from("path_resources")
            .select("*")
            .in("stage_id", stageIds)
            .eq("user_status", "suggested")
            .order("res_order", { ascending: true })
        : { data: [] as any[] };

    const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
    pathCandidates = (resources ?? []).map((r) => ({
      ...r,
      stage: stageById.get(r.stage_id),
    }));
  }

  // Subscription items (Step B fills real data; for now empty if no subs)
  const { data: subItems } = await supabase
    .from("subscription_items")
    .select("*, subscription:subscriptions(id, title, site_url, atlas_id)")
    .eq("user_status", "new")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(50);

  const subscriptionCandidates = (subItems ?? []).filter(
    (it: any) => it.subscription?.atlas_id === atlas.id
  );

  // Manual candidates
  const { data: manualCandidates } = await supabase
    .from("manual_candidates")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    path: pathCandidates,
    subscription: subscriptionCandidates,
    manual: manualCandidates ?? [],
  });
}
