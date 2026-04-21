import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PathClient } from "../path/path-client";
import type { LearningPath } from "@/lib/types";

export function PlanSection({
  slug,
  path,
  atlasName,
  thesis,
}: {
  slug: string;
  path: LearningPath | null;
  atlasName: string;
  thesis: string | null;
}) {
  if (!path) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <div className="text-4xl">🧭</div>
        <div className="mt-4 text-base font-medium">还没有学习路径</div>
        <div className="mt-1 text-sm text-muted-foreground">
          AI 基于主题帮你规划 3-6 个阶段，每阶段推荐 3-6 个资源
        </div>
        <Link href={`/app/atlases/${slug}/path/new`}>
          <Button className="mt-6">生成学习路径</Button>
        </Link>
      </div>
    );
  }

  return <PathClient slug={slug} atlasName={atlasName} path={path} />;
}
