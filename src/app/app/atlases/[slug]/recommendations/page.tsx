import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { notFound } from "next/navigation";
import { RecommendationsShell, type SubTab } from "./recommendations-shell";
import { PlanSection } from "./plan-section";
import { SubscriptionSection } from "./subscription-section";
import { ManualSection } from "./manual-section";
import type {
  LearningPath,
  ManualCandidate,
  PathStage,
  Subscription,
  SubscriptionItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_TABS: SubTab[] = ["plan", "subscription", "manual"];

export default async function RecommendationsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const supabase = createSupabaseServer();
  const slug = decodeSlug(params.slug);

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, slug, name, thesis")
    .eq("slug", slug)
    .maybeSingle();
  if (!atlas) notFound();

  const tab: SubTab = VALID_TABS.includes(searchParams.tab as SubTab)
    ? (searchParams.tab as SubTab)
    : "plan";

  // Counts for every sub-tab (so the tab bar shows badge numbers)
  const counts = await loadCounts(supabase, atlas.id);

  // If user has no active path at all, auto-redirect them to /path/new
  // (which itself redirects to /recommendations?tab=plan after generation).
  if (tab === "plan" && counts.path === 0) {
    const { data: existingPath } = await supabase
      .from("learning_paths")
      .select("id")
      .eq("atlas_id", atlas.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!existingPath) {
      redirect(`/app/atlases/${slug}/path/new`);
    }
  }

  let sectionContent: React.ReactNode = null;

  if (tab === "plan") {
    const pathData = await loadPath(supabase, atlas.id);
    sectionContent = (
      <PlanSection slug={slug} path={pathData} atlasName={atlas.name} thesis={atlas.thesis} />
    );
  } else if (tab === "subscription") {
    const subData = await loadSubscriptions(supabase, atlas.id);
    sectionContent = (
      <SubscriptionSection
        slug={slug}
        subscriptions={subData.subscriptions}
        items={subData.items}
      />
    );
  } else {
    const manual = await loadManual(supabase, atlas.id);
    sectionContent = <ManualSection slug={slug} initial={manual} />;
  }

  return (
    <RecommendationsShell slug={slug} currentTab={tab} counts={counts}>
      {sectionContent}
    </RecommendationsShell>
  );
}

async function loadCounts(
  supabase: ReturnType<typeof createSupabaseServer>,
  atlasId: string
) {
  // Path candidate count: resources across any active path still 'suggested'
  const { data: activePath } = await supabase
    .from("learning_paths")
    .select("id")
    .eq("atlas_id", atlasId)
    .eq("is_active", true)
    .maybeSingle();

  let pathCount = 0;
  if (activePath) {
    const { data: stages } = await supabase
      .from("path_stages")
      .select("id")
      .eq("path_id", activePath.id);
    const stageIds = (stages ?? []).map((s) => s.id);
    if (stageIds.length > 0) {
      const { count } = await supabase
        .from("path_resources")
        .select("id", { count: "exact", head: true })
        .in("stage_id", stageIds)
        .eq("user_status", "suggested");
      pathCount = count ?? 0;
    }
  }

  // Subscription candidates (items new)
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("atlas_id", atlasId);
  const subIds = (subs ?? []).map((s) => s.id);
  let subCount = 0;
  if (subIds.length > 0) {
    const { count } = await supabase
      .from("subscription_items")
      .select("id", { count: "exact", head: true })
      .in("subscription_id", subIds)
      .eq("user_status", "new");
    subCount = count ?? 0;
  }

  const { count: manualCount } = await supabase
    .from("manual_candidates")
    .select("id", { count: "exact", head: true })
    .eq("atlas_id", atlasId);

  return { path: pathCount, subscription: subCount, manual: manualCount ?? 0 };
}

async function loadPath(
  supabase: ReturnType<typeof createSupabaseServer>,
  atlasId: string
): Promise<LearningPath | null> {
  const { data: path } = await supabase
    .from("learning_paths")
    .select("*")
    .eq("atlas_id", atlasId)
    .eq("is_active", true)
    .maybeSingle<LearningPath>();
  if (!path) return null;

  const { data: stages } = await supabase
    .from("path_stages")
    .select("*")
    .eq("path_id", path.id)
    .order("stage_order", { ascending: true });

  const stageIds = (stages ?? []).map((s) => s.id);
  const { data: resources } =
    stageIds.length > 0
      ? await supabase
          .from("path_resources")
          .select("*")
          .in("stage_id", stageIds)
          .order("res_order", { ascending: true })
      : { data: [] };

  const byStage = new Map<string, any[]>();
  for (const r of resources ?? []) {
    const arr = byStage.get(r.stage_id) ?? [];
    arr.push(r);
    byStage.set(r.stage_id, arr);
  }

  return {
    ...path,
    stages: (stages ?? []).map((s) => ({
      ...(s as PathStage),
      resources: byStage.get(s.id) ?? [],
    })),
  };
}

async function loadSubscriptions(
  supabase: ReturnType<typeof createSupabaseServer>,
  atlasId: string
): Promise<{ subscriptions: Subscription[]; items: (SubscriptionItem & { subscription?: { title: string; site_url: string | null } })[] }> {
  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("atlas_id", atlasId)
    .order("created_at", { ascending: false });

  const subIds = (subscriptions ?? []).map((s) => s.id);
  const { data: items } =
    subIds.length > 0
      ? await supabase
          .from("subscription_items")
          .select("*, subscription:subscriptions(title, site_url)")
          .in("subscription_id", subIds)
          .eq("user_status", "new")
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(50)
      : { data: [] };

  return {
    subscriptions: (subscriptions ?? []) as Subscription[],
    items: (items ?? []) as any,
  };
}

async function loadManual(
  supabase: ReturnType<typeof createSupabaseServer>,
  atlasId: string
): Promise<ManualCandidate[]> {
  const { data } = await supabase
    .from("manual_candidates")
    .select("*")
    .eq("atlas_id", atlasId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ManualCandidate[];
}
