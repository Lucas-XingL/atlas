/**
 * EPUB → plain text extractor.
 *
 * Strategy: parse the EPUB (a zipped set of XHTML chapters), iterate the
 * spine in reading order, strip tags, concatenate.
 *
 * epub2's `createAsync` reads from a file path, so on serverless we drop the
 * buffer into `/tmp` first (writable on Vercel/AWS Lambda). The temp file is
 * cleaned up before returning.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line
const { EPub } = require("epub2") as typeof import("epub2");

export interface EpubExtractResult {
  text: string;
  chapter_count: number;
  title: string | null;
  author: string | null;
}

export async function extractEpubText(buffer: Buffer): Promise<EpubExtractResult> {
  const dir = await mkdtemp(join(tmpdir(), "atlas-epub-"));
  const file = join(dir, "book.epub");
  await writeFile(file, buffer);

  try {
    const epub = await EPub.createAsync(file);

    const spine = (epub.flow ?? []) as Array<{ id?: string; href?: string }>;
    const parts: string[] = [];

    for (const item of spine) {
      if (!item.id) continue;
      try {
        const chapterText = await epub.getChapterAsync(item.id);
        if (chapterText) parts.push(stripTags(chapterText));
      } catch {
        // Some EPUBs have broken spine refs; skip and keep going.
      }
    }

    const metadata = (epub.metadata ?? {}) as {
      title?: string;
      creator?: string;
      creatorFileAs?: string;
    };

    return {
      text: parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim(),
      chapter_count: parts.length,
      title: metadata.title ?? null,
      author: metadata.creator ?? metadata.creatorFileAs ?? null,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      /* best effort */
    });
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

