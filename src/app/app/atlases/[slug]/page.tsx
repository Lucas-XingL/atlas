import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default async function AtlasDashboard({
  params,
}: {
  params: { slug: string };
}) {
  const slug = decodeSlug(params.slug);
  const supabase = createSupabaseServer();
  const { data: atlas } = await supabase
    .from("atlases")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!atlas) return null;

  const sinceWeek = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { count: journal_count },
    { count: source_count },
    { count: flashcard_count },
    { data: dueCards },
    { data: latestDigest },
  ] = await Promise.all([
    supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("atlas_id", atlas.id).gte("created_at", sinceWeek),
    supabase.from("sources").select("id", { count: "exact", head: true }).eq("atlas_id", atlas.id).gte("ingested_at", sinceWeek),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("atlas_id", atlas.id).gte("created_at", sinceWeek),
    supabase.from("flashcards").select("id, front").eq("atlas_id", atlas.id).lte("next_review_at", new Date(Date.now() + 4 * 3600_000).toISOString()).order("next_review_at").limit(3),
    supabase.from("digest_snapshots").select("content, period_end").eq("atlas_id", atlas.id).eq("period", "weekly").order("period_end", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10 space-y-8">
      {/* Today's cards */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Today
        </h2>
        {dueCards && dueCards.length > 0 ? (
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">今日待复习 {dueCards.length} 张</div>
              <ul className="mt-3 space-y-2">
                {dueCards.map((c) => (
                  <li key={c.id} className="truncate text-sm">
                    · {c.front}
                  </li>
                ))}
              </ul>
              <Link
                href="/app/flashcards/due"
                className="mt-4 inline-flex text-sm text-primary hover:underline"
              >
                开始复习 →
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-border/60 bg-card/40 p-5 text-sm text-muted-foreground">
            今天没有需要复习的卡片。去 Journal 写点什么吧。
          </div>
        )}
      </section>

      {/* Week stats */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          本周
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Journal" value={journal_count ?? 0} suffix="条" />
          <Stat label="Flashcards" value={flashcard_count ?? 0} suffix="张 new" />
          <Stat label="Sources" value={source_count ?? 0} suffix="篇" />
        </div>
      </section>

      {/* Weekly digest */}
      {latestDigest?.content && typeof (latestDigest.content as any).markdown === "string" ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Weekly Digest
            </h2>
            <Badge variant="outline">{latestDigest.period_end}</Badge>
          </div>
          <Card>
            <CardContent className="prose-atlas p-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {(latestDigest.content as any).markdown}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}
