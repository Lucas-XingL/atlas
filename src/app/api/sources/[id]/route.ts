import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ingestSourceIntoWiki } from "@/lib/pipeline/ingest-wiki";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["unread", "reading", "read", "dismissed"]).optional(),
  reading_progress: z.number().int().min(0).max(100).optional(),
  title: z.string().max(300).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ source: data });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const update: Record<string, unknown> = { ...parsed.data };
  // If marking as 100% read, also flip status to 'read' for convenience
  if (update.reading_progress === 100 && !update.status) {
    update.status = "read";
  }
  // If marking as read explicitly, bump progress to 100
  if (update.status === "read" && update.reading_progress === undefined) {
    update.reading_progress = 100;
  }

  // Snapshot pre-update state so we can detect the unread/reading → read transition.
  const { data: prev } = await supabase
    .from("sources")
    .select("status, wiki_ingested_at, raw_content, user_id")
    .eq("id", params.id)
    .maybeSingle<{
      status: string;
      wiki_ingested_at: string | null;
      raw_content: string | null;
      user_id: string;
    }>();

  const { data, error } = await supabase
    .from("sources")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If this source is linked to a path_resource, sync its user_status
  if (data.path_resource_id) {
    const mapping: Record<string, string> = {
      unread: "accepted",
      reading: "reading",
      read: "finished",
      dismissed: "skipped",
    };
    const next = data.status ? mapping[data.status] : null;
    if (next) {
      await supabase
        .from("path_resources")
        .update({ user_status: next })
        .eq("id", data.path_resource_id);
    }
  }

  // Auto-ingest into wiki on first transition to 'read' (only if there's content
  // to ingest — PDFs without extracted text or pending-paste rows are skipped).
  const justMarkedRead =
    data.status === "read" &&
    prev?.status !== "read" &&
    !prev?.wiki_ingested_at &&
    (data.raw_content?.length ?? 0) > 0;

  if (justMarkedRead && prev?.user_id) {
    // Fire-and-forget: don't block the PATCH response on LLM latency.
    // Errors are recorded against the source row's fetch_error-free path; we
    // log to console and the user can retry via the manual button.
    void ingestSourceIntoWiki(supabase, data.id, prev.user_id)
      .then((r) => {
        if (!r.ok) console.error("[wiki-ingest] failed", { id: data.id, error: r.error });
      })
      .catch((err) => console.error("[wiki-ingest] threw", { id: data.id, err }));
  }

  return NextResponse.json({ source: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("sources").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
