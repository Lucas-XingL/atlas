import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import { generateKickstartQueries } from "@/lib/ai/kickstart";
import type { Atlas } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Step 1: LLM drafts search queries (fast, ~3-5s).
 * Returns: { queries: string[] }
 */
export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, name, thesis, tags")
    .eq("slug", decodeSlug(params.slug))
    .maybeSingle<Pick<Atlas, "id" | "name" | "thesis" | "tags">>();
  if (!atlas) return NextResponse.json({ error: "not found" }, { status: 404 });

  const llm = await resolveLlmConfig(supabase, user.id);

  try {
    const queries = await generateKickstartQueries(llm, atlas);
    return NextResponse.json({ queries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[kickstart/queries] failed", { atlas: atlas.id, err: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
