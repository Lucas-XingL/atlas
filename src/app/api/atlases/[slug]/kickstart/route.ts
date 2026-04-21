import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { runKickstart } from "@/lib/ai/kickstart";
import type { Atlas } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Run a one-off "kickstart" for this atlas:
 *  - LLM drafts 3-5 search queries from name + thesis
 *  - Brave search fetches real URLs
 *  - LLM picks the best 6-12 with why_relevant
 *
 * Returns candidates WITHOUT inserting to sources. The client picks which
 * to keep and calls /kickstart/accept.
 */
export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const braveKey = process.env.BRAVE_API_KEY;
  if (!braveKey) {
    return NextResponse.json(
      { error: "BRAVE_API_KEY not configured on server" },
      { status: 500 }
    );
  }

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, name, thesis, tags")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle<Pick<Atlas, "id" | "name" | "thesis" | "tags">>();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const llm = await resolveLlmConfig(supabase, user.id);

  try {
    const result = await runKickstart(llm, braveKey, atlas);
    return NextResponse.json({
      queries: result.queries,
      candidates: result.candidates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[kickstart] failed", { atlas: atlas.id, err: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
