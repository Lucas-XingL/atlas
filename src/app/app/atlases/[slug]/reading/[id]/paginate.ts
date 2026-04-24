/**
 * Paginate a long markdown document into "book pages" of ~targetChars each.
 *
 * Guarantees:
 *   - page boundaries are computed once on the raw markdown (before
 *     ReactMarkdown touches it), so highlight offsets stay addressable as
 *     a single integer into the original string.
 *   - prefers to break on blank-line paragraph boundaries; falls back to
 *     sentence boundaries; falls back to the raw char cap as a last resort.
 *   - never splits inside a fenced ``` code block (closes it on page end
 *     and re-opens on the next page with the original language tag).
 *   - chapter-ish markdown headings (# or ##) force a soft page break if
 *     we're already at ~60% of the target — keeps chapters starting on a
 *     fresh page without creating absurdly short pages.
 */

export interface Page {
  /** 0-based page number. */
  index: number;
  /** Character offset (inclusive) into the full markdown where this page begins. */
  start: number;
  /** Character offset (exclusive) where this page ends. */
  end: number;
  /** The markdown body for this page — equivalent to markdown.slice(start, end). */
  body: string;
}

const TARGET_CHARS = 6000;           // ~10-15 min reading for CJK
const MAX_CHARS = TARGET_CHARS * 1.6; // hard ceiling to prevent super-long pages
const MIN_CHARS_FOR_HEADING_BREAK = TARGET_CHARS * 0.6;

export function paginateMarkdown(
  markdown: string,
  opts?: { targetChars?: number }
): Page[] {
  const target = opts?.targetChars ?? TARGET_CHARS;
  const hardMax = target * 1.6;
  const headingBreakThreshold = target * 0.6;

  if (markdown.length === 0) {
    return [{ index: 0, start: 0, end: 0, body: "" }];
  }

  const pages: Page[] = [];
  let cursor = 0;

  while (cursor < markdown.length) {
    const remaining = markdown.length - cursor;
    if (remaining <= hardMax) {
      pages.push({
        index: pages.length,
        start: cursor,
        end: markdown.length,
        body: sanitizeFencedCode(markdown.slice(cursor, markdown.length), markdown, cursor),
      });
      break;
    }

    // Search for a break point starting from targetChars, widening outward.
    const breakAt = findBreakPoint(markdown, cursor, target, hardMax, headingBreakThreshold);
    const body = sanitizeFencedCode(markdown.slice(cursor, breakAt), markdown, cursor);
    pages.push({ index: pages.length, start: cursor, end: breakAt, body });
    cursor = breakAt;
  }

  return pages;
}

function findBreakPoint(
  md: string,
  from: number,
  target: number,
  hardMax: number,
  headingBreakThreshold: number
): number {
  const idealEnd = from + target;
  const hardEnd = Math.min(md.length, from + hardMax);

  // 1. Chapter heading early break: if there's a top-level heading anywhere
  //    between `from + headingBreakThreshold` and the ideal end, break right
  //    before the heading so each chapter starts its own page.
  const headingStart = from + headingBreakThreshold;
  for (let i = headingStart; i < idealEnd && i < md.length - 2; i++) {
    if (md[i] === "\n" && (md[i + 1] === "#" || (md[i + 1] === "\n" && md[i + 2] === "#"))) {
      // position right at the newline so the heading starts the next page
      const p = md[i + 1] === "\n" ? i + 1 : i + 1;
      if (p > from + 100) return p;
    }
  }

  // 2. Prefer blank-line paragraph break near ideal end.
  const windowStart = Math.max(from + Math.floor(target * 0.5), from + 500);
  const paragraphBreak = findLastBlankLine(md, windowStart, hardEnd);
  if (paragraphBreak > from) return paragraphBreak;

  // 3. Sentence terminator fallback (CJK and latin).
  const sentenceBreak = findLastSentenceEnd(md, windowStart, hardEnd);
  if (sentenceBreak > from) return sentenceBreak;

  // 4. Hard cut at hardMax.
  return hardEnd;
}

function findLastBlankLine(md: string, start: number, end: number): number {
  // Look for `\n\n` — the end of a paragraph.
  for (let i = end - 1; i > start; i--) {
    if (md[i] === "\n" && md[i - 1] === "\n") {
      return i + 1;
    }
  }
  return -1;
}

function findLastSentenceEnd(md: string, start: number, end: number): number {
  const terminators = new Set(["。", "！", "？", ".", "!", "?", "”", "\""]);
  for (let i = end - 1; i > start; i--) {
    if (terminators.has(md[i])) {
      // Prefer the position right after the terminator.
      if (md[i + 1] === "\n" || md[i + 1] === " " || md[i + 1] === undefined) {
        return i + 1;
      }
    }
  }
  return -1;
}

/**
 * If the page slice we chose starts or ends inside a fenced ``` block,
 * patch the page body so it renders as valid markdown on its own.
 *
 *   - If the page opens mid-block (previous block started before `cursor`
 *     and is still open at `cursor`), prepend a matching ``` fence.
 *   - If the page closes mid-block (body has odd number of ``` fences),
 *     append a closing ```.
 *
 * This is best-effort — it won't rescue weird nested/tilde fences, but it
 * keeps the common case readable.
 */
function sanitizeFencedCode(body: string, fullMd: string, sliceStart: number): string {
  const openBeforeSlice = countFences(fullMd.slice(0, sliceStart)) % 2 === 1;
  const fencesInBody = countFences(body);
  let patched = body;
  if (openBeforeSlice) {
    // Try to preserve the language tag of the open fence by finding the last
    // opener before sliceStart.
    const lang = lastFenceLang(fullMd.slice(0, sliceStart)) ?? "";
    patched = "```" + lang + "\n" + patched;
  }
  const effectiveFences = fencesInBody + (openBeforeSlice ? 1 : 0);
  if (effectiveFences % 2 === 1) {
    patched = patched + "\n```";
  }
  return patched;
}

function countFences(s: string): number {
  let count = 0;
  let i = 0;
  while (i < s.length) {
    const nl = s.indexOf("\n```", i);
    if (nl === -1) {
      // Also check if the very start is ```
      if (i === 0 && s.startsWith("```")) count++;
      break;
    }
    count++;
    i = nl + 4;
  }
  return count;
}

function lastFenceLang(s: string): string | null {
  const idx = s.lastIndexOf("```");
  if (idx === -1) return null;
  const nl = s.indexOf("\n", idx);
  if (nl === -1) return null;
  return s.slice(idx + 3, nl).trim() || null;
}

/** Map a global character offset onto its page index. */
export function pageOfOffset(pages: Page[], offset: number): number {
  for (const p of pages) {
    if (offset < p.end) return p.index;
  }
  return Math.max(0, pages.length - 1);
}
