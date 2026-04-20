import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ArrowRight } from "lucide-react";

export default async function AppHomePage() {
  const supabase = createSupabaseServer();
  const { data: atlases } = await supabase
    .from("atlases")
    .select("id, slug, name, thesis, updated_at")
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (!atlases || atlases.length === 0) {
    redirect("/app/atlases/new");
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">你的 Atlas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每个 Atlas 聚焦一个主题。选一个开始，或创建新的。
          </p>
        </div>
        <Link href="/app/atlases/new">
          <Button>
            <Plus className="h-4 w-4" />
            新建 Atlas
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {atlases.map((a) => (
          <Link key={a.id} href={`/app/atlases/${a.slug}`} className="group">
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{a.name}</div>
                    {a.thesis ? (
                      <div className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                        {a.thesis}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-sm italic text-muted-foreground/60">
                        暂无 thesis
                      </div>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
