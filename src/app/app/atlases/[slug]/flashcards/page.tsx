import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function FlashcardsPage({ params }: { params: { slug: string } }) {
  const slug = decodeSlug(params.slug);
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!atlas) return null;

  const { data: cards } = await supabase
    .from("flashcards")
    .select("*")
    .eq("atlas_id", atlas.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const dueCount = (cards ?? []).filter(
    (c) => new Date(c.next_review_at).getTime() <= Date.now() + 4 * 3600_000
  ).length;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          共 {cards?.length ?? 0} 张 · {dueCount} 张待复习
        </div>
        {dueCount > 0 ? (
          <Link href={`/app/flashcards/due?from=/app/atlases/${params.slug}`}>
            <Button size="sm">开始复习</Button>
          </Link>
        ) : null}
      </div>

      {!cards || cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          还没有 flashcard。每晚 3am AI 会从你的 journal 提炼。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="text-sm font-medium">{c.front}</div>
                <div className="mt-2 text-xs text-muted-foreground">{c.back}</div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="outline">{c.stage}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    maturity {c.maturity}/10 · next{" "}
                    {new Date(c.next_review_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
