import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { detectSourceType } from "@/lib/fetch/web";
import { processSourceById, summarizePastedText } from "@/lib/pipeline/process-source";
import type { ResourceType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/path-resources/[id]/accept
 *
 * Contract (iter 3 — human-sources):
 *   The AI path generator no longer supplies URLs. The user MUST provide the
 *   actual content when accepting a path resource. Body:
 *
 *     { content: { kind: "url",  url: string } }
 *     { content: { kind: "pdf",  pdf_storage_path: string } }
 *     { content: { kind: "text", text: string } }
 *
 *   The endpoint creates the source row with origin='path' so downstream UI
 *   knows it came from the learning plan. It then either kicks off /process
 *   (URL), stores the PDF pointer for client-side pdf-ingest, or inlines
 *   the pasted text and summarizes immediately.
 *
 *   Returns `source_id` fast. For URL / PDF the heavy work still happens
 *   asynchronously via the existing polling flow in the reader page.
 */

const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().url() }),
  z.object({ kind: z.literal("pdf"), pdf_storage_path: z.string().min(1) }),
  z.object({ kind: z.literal("text"), text: z.string().min(20).max(200_000) }),
]);

const bodySchema = z.object({ content: contentSchema });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "content required: { content: { kind: 'url'|'pdf'|'text', ... } }" },
      { status: 400 }
    );
  }
  const { content } = parsed.data;

  const { data: resource } = await supabase
    .from("path_resources")
    .select("*, stage:path_stages(path_id, path:learning_paths(atlas_id))")
    .eq("id", params.id)
    .maybeSingle();
  if (!resource) return NextResponse.json({ error: "resource not found" }, { status: 404 });

  const atlasId = (resource.stage as { path?: { atlas_id?: string } } | null)?.path?.atlas_id;
  if (!atlasId) return NextResponse.json({ error: "atlas lookup failed" }, { status: 500 });

  if (resource.source_id) {
    return NextResponse.json({ source_id: resource.source_id, already_accepted: true });
  }

  // Derive the source fields from the chosen content kind.
  let sourceUrl: string | null = null;
  let sourceType: "web" | "arxiv" | "pdf" | "video" | "text" = "text";
  let resourceType: ResourceType = "consumable";
  let pdfStoragePath: string | null = null;

  if (content.kind === "url") {
    sourceUrl = content.url;
    sourceType = detectSourceType(content.url);
    resourceType = "consumable";
  } else if (content.kind === "pdf") {
    // Path must be scoped to this user: `<user_id>/...`
    if (!content.pdf_storage_path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "pdf path not owned by user" }, { status: 403 });
    }
    pdfStoragePath = content.pdf_storage_path;
    sourceType = "pdf";
    resourceType = "physical";
  } else {
    sourceType = "text";
    resourceType = "consumable";
  }

  const { data: src, error: srcErr } = await supabase
    .from("sources")
    .insert({
      atlas_id: atlasId,
      user_id: user.id,
      url: sourceUrl,
      title: resource.title,
      author: resource.author,
      source_type: sourceType,
      resource_type: resourceType,
      path_resource_id: resource.id,
      origin: "path",
      origin_ref: resource.id,
      status: "unread",
      ai_recommended: true,
      fetch_status: "pending",
      pdf_storage_path: pdfStoragePath,
      summary: resource.why_relevant ? { why_relevant: resource.why_relevant } : {},
    })
    .select()
    .single();

  if (srcErr || !src) {
    return NextResponse.json({ error: srcErr?.message ?? "insert source failed" }, { status: 500 });
  }

  await supabase
    .from("path_resources")
    .update({ source_id: src.id, user_status: "accepted" })
    .eq("id", resource.id);

  // Drive the ingestion pipeline based on the chosen content kind.
  if (content.kind === "url") {
    // Fire-and-forget; the reader page polls fetch_status and surfaces errors.
    void processSourceById(supabase, src.id, user.id).catch((err) => {
      console.error("[accept:url] processSourceById threw", err);
    });
    return NextResponse.json({ source_id: src.id });
  }

  if (content.kind === "text") {
    const result = await summarizePastedText(supabase, src.id, user.id, {
      title: resource.title,
      text: content.text,
    });
    if (!result.ok) {
      return NextResponse.json({ source_id: src.id, fetch_ok: false, error: result.error });
    }
    return NextResponse.json({ source_id: src.id });
  }

  // PDF: the client has already uploaded to storage. Return source_id so the
  // client can POST /api/sources/:id/pdf-ingest to extract text + summarize.
  return NextResponse.json({ source_id: src.id, needs_pdf_ingest: true });
}
