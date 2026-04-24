import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ingestSourceIntoWiki } from "@/lib/pipeline/ingest-wiki";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Manually (re-)ingest a source into the wiki. Useful for:
 *   - rebuilding after a source was edited
 *   - forcing an ingest for sources whose auto-ingest failed
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await ingestSourceIntoWiki(supabase, params.id, user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source_page_slug: result.source_page_slug });
}
