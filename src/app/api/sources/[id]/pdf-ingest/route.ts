import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/fetch/pdf";
import { summarizePastedText } from "@/lib/pipeline/process-source";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  pdf_storage_path: z.string().min(1),
});

const MAX_TEXT_CHARS = 200_000;

/**
 * Ingest an already-uploaded PDF:
 *   1. Verify the source belongs to the current user
 *   2. Download the PDF blob from Supabase Storage (service-role bypasses RLS)
 *   3. Extract text via pdf-parse
 *   4. Store storage path + run the standard summarize pipeline
 *
 * The PDF itself is uploaded client-side direct to Storage (so we don't hit
 * Next.js's ~4.5 MB request-body limit on Vercel). We only receive the
 * `pdf_storage_path` here.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { pdf_storage_path } = parsed.data;

  // Storage path must be scoped to this user: `<user_id>/...`
  if (!pdf_storage_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "storage path not owned by user" }, { status: 403 });
  }

  // Verify source ownership
  const { data: src } = await supabase
    .from("sources")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!src || src.user_id !== user.id) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }

  // Mark fetching + save storage path so a later retry can reuse the upload
  await supabase
    .from("sources")
    .update({ fetch_status: "fetching", pdf_storage_path })
    .eq("id", params.id);

  try {
    // Download via service-role (RLS-bypassing) — the user already passed auth
    const service = createSupabaseServiceRole();
    const { data: blob, error: dlErr } = await service.storage
      .from("pdfs")
      .download(pdf_storage_path);
    if (dlErr || !blob) {
      throw new Error(`storage download failed: ${dlErr?.message ?? "unknown"}`);
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const { text, page_count } = await extractPdfText(buffer);
    const trimmed = text.slice(0, MAX_TEXT_CHARS).trim();

    if (!trimmed || trimmed.length < 50) {
      throw new Error(
        page_count === 0
          ? "无法解析 PDF（文件可能损坏）"
          : "未能从 PDF 提取到文字 — 可能是扫描件，请手动粘贴文本"
      );
    }

    const result = await summarizePastedText(supabase, params.id, user.id, {
      text: trimmed,
    });
    if (!result.ok) throw new Error(result.error);

    const { data } = await supabase
      .from("sources")
      .select("id, title, fetch_status, fetch_error, summary, pdf_storage_path")
      .eq("id", params.id)
      .maybeSingle();

    return NextResponse.json({ source: data, page_count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await supabase
      .from("sources")
      .update({ fetch_status: "failed", fetch_error: message.slice(0, 500) })
      .eq("id", params.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
