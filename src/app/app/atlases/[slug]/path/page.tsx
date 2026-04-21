import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { PathClient } from "./path-client";
import type { LearningPath, PathResource, PathStage } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PathPage({ params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const slug = decodeSlug(params.slug);

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!atlas) return null;

  const { data: path } = await supabase
    .from("learning_paths")
    .select("*")
    .eq("atlas_id", atlas.id)
    .eq("is_active", true)
    .maybeSingle<LearningPath>();

  if (!path) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-14 text-center">
        <div className="text-4xl">🧭</div>
        <div className="mt-4 text-base font-medium">还没有学习路径</div>
        <div className="mt-1 text-sm text-muted-foreground">
          让 AI 基于主题帮你规划 3-6 个阶段，每阶段推荐 3-6 个资源
        </div>
        <Link href={`/app/atlases/${slug}/path/new`}>
          <Button className="mt-6">生成学习路径</Button>
        </Link>
      </div>
    );
  }

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
      : { data: [] as PathResource[] };

  const byStage = new Map<string, PathResource[]>();
  for (const r of resources ?? []) {
    const arr = byStage.get(r.stage_id) ?? [];
    arr.push(r);
    byStage.set(r.stage_id, arr);
  }

  const nestedStages: PathStage[] = (stages ?? []).map((s) => ({
    ...(s as PathStage),
    resources: byStage.get(s.id) ?? [],
  }));

  return (
    <PathClient
      slug={slug}
      atlasName={atlas.name}
      path={{ ...path, stages: nestedStages }}
    />
  );
}
