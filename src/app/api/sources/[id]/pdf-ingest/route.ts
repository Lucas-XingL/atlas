import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, createSupabaseServiceRole } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/fetch/pdf";
import { extractEpubText } from "@/lib/fetch/epub";
import { summarizePastedText } from "@/lib/pipeline/process-source";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = z.object({
  // Legacy name; still accepted. Either PDF or EPUB storage path is fine.
  pdf_storage_path: z.string().min(1),
});

const MAX_TEXT_CHARS = 400_000;

/**
 * Ingest an already-uploaded document (PDF or EPUB):
 *   1. Verify ownership of the source and the storage path
 *   2. Download the blob via service-role
 *   3. Dispatch to PDF or EPUB extractor based on extension
 *   4. Summarize + persist raw_content via the standard pipeline
 *
 * The bucket is still called `pdfs` for historical reasons — after 009 it
 * accepts EPUBs too. The endpoint URL stays /pdf-ingest to avoid breaking
 * older clients; `pdf_storage_path` is now a generic doc path.
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
  const storagePath = parsed.data.pdf_storage_path;

  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "storage path not owned by user" }, { status: 403 });
  }

  const { data: src } = await supabase
    .from("sources")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!src || src.user_id !== user.id) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }

  const isEpub = storagePath.toLowerCase().endsWith(".epub");

  await supabase
    .from("sources")
    .update({ fetch_status: "fetching", pdf_storage_path: storagePath })
    .eq("id", params.id);

  try {
    const service = createSupabaseServiceRole();
    const { data: blob, error: dlErr } = await service.storage
      .from("pdfs")
      .download(storagePath);
    if (dlErr || !blob) {
      throw new Error(`storage download failed: ${dlErr?.message ?? "unknown"}`);
    }
    const buffer = Buffer.from(await blob.arrayBuffer());

    let text: string;
    let meta: { title?: string | null; author?: string | null } = {};
    let unit_count = 0;

    if (isEpub) {
      const res = await extractEpubText(buffer);
      text = res.text;
      unit_count = res.chapter_count;
      meta = { title: res.title, author: res.author };
    } else {
      const res = await extractPdfText(buffer);
      text = res.text;
      unit_count = res.page_count;
    }

    const trimmed = text.slice(0, MAX_TEXT_CHARS).trim();

    if (!trimmed || trimmed.length < 50) {
      const detail = isEpub
        ? unit_count === 0
          ? "EPUB 里没有读到章节内容（文件可能是空的或损坏）"
          : "未能从 EPUB 提取到文字 — 可能全是图片或 DRM 加密"
        : unit_count === 0
          ? "无法解析 PDF（文件可能损坏）"
          : "未能从 PDF 提取到文字 — 可能是扫描件，请手动粘贴文本";
      throw new Error(detail);
    }

    // For EPUBs, prefer the parsed title/author if the source row didn't have
    // them. Don't overwrite a user-provided title.
    const titleUpdate: Record<string, unknown> = {};
    if (isEpub) {
      const { data: current } = await supabase
        .from("sources")
        .select("title, author")
        .eq("id", params.id)
        .maybeSingle<{ title: string; author: string | null }>();
      if (current) {
        if (meta.title && (!current.title || current.title === "Untitled")) {
          titleUpdate.title = meta.title;
        }
        if (meta.author && !current.author) titleUpdate.author = meta.author;
      }
      if (Object.keys(titleUpdate).length > 0) {
        await supabase.from("sources").update(titleUpdate).eq("id", params.id);
      }
    }

    const result = await summarizePastedText(supabase, params.id, user.id, {
      text: trimmed,
      title: isEpub ? (meta.title ?? undefined) : undefined,
    });
    if (!result.ok) throw new Error(result.error);

    const { data } = await supabase
      .from("sources")
      .select("id, title, fetch_status, fetch_error, summary, pdf_storage_path")
      .eq("id", params.id)
      .maybeSingle();

    return NextResponse.json({
      source: data,
      format: isEpub ? "epub" : "pdf",
      [isEpub ? "chapter_count" : "page_count"]: unit_count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await supabase
      .from("sources")
      .update({ fetch_status: "failed", fetch_error: message.slice(0, 500) })
      .eq("id", params.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
