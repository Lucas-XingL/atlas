import { chat } from "@/lib/ai/provider";
import { parseJsonLoose } from "@/lib/ai/json";
import type { ResolvedLlmConfig } from "@/lib/ai/resolve-config";
import type { Atlas, Source, WikiPage } from "@/lib/types";

/**
 * Wiki ingest (Karpathy LLM-wiki pattern, adapted).
 *
 * Input:  one source + its highlights + user notes + the current wiki index
 *         (just slug/title/kind, not bodies — keeps the prompt small).
 * Output: up to 5 page upserts:
 *           - exactly one 'source' page  (reading-notes for this source)
 *           - 0-4 'concept' pages        (new or refined)
 *
 * Deliberately NOT doing: rewriting unrelated concept pages, touching index/log
 * (the pipeline handles those mechanically), multi-source batch ingest.
 */

export interface WikiIngestInput {
  atlas: Pick<Atlas, "id" | "name" | "thesis">;
  source: Pick<Source, "id" | "title" | "url" | "author" | "summary" | "raw_content">;
  highlights: Array<{
    id: string;
    text: string;
    note?: string | null;
    user_journal?: string | null; // the linked journal entry text, if any
  }>;
  /** Slim catalog of existing wiki pages so the LLM reuses slugs instead of
      inventing near-duplicates. Max ~200 items — prompt budget permitting. */
  existing_pages: Array<Pick<WikiPage, "slug" | "title" | "kind">>;
  /** Recent concept page bodies (≤ 3) that are most likely to need updating. */
  hot_concepts: Array<Pick<WikiPage, "slug" | "title" | "body_md">>;
}

export interface WikiPageOp {
  slug: string;
  title: string;
  kind: "source" | "concept";
  body_md: string;
  /** Normalized tags/aliases the LLM chose for this page. */
  tags?: string[];
  aliases?: string[];
}

export interface WikiIngestResult {
  source_page: WikiPageOp;
  concept_ops: WikiPageOp[];
  /** Short one-sentence summary for the ingest log. */
  log_summary: string;
}

const SYSTEM = `你是 Atlas 的 wiki 维护 agent。用户读完了一个 source，你要把它 ingest 进这个 atlas 的知识库（markdown wiki）。

原则：
- wiki 是持续演化的知识网络，不是摘要堆。每张 page 都应该值得未来被回看。
- 少即是多：本次最多产出 5 张 page（1 张 source + 最多 4 张 concept）。
- 宁可不动旧 concept，也不要牵强地改。只有当新 source 明显补强/修正已有观点时才改。
- 用 [[slug]] 做内部链接（kebab-case，中文用拼音或英文），这些就是 wiki 图里的边。

Page 格式（body_md）：
- source 页：
  ## 核心论点
  3-5 条 bullet
  ## 关键证据
  原文金句 + highlight，用 > 引用
  ## 我的随记
  （有 user_journal 时引用，并用"你"的口吻连贯表达）
  ## 相关
  - [[concept-a]] — 关联原因
  - [[concept-b]] — 关联原因
- concept 页：
  ## 定义
  一句话定义
  ## 要点
  3-5 条 bullet
  ## 来源
  - [[source-xxx]] — 这里学到什么
  ## 相关
  - [[other-concept]] — 关联

Slug 规则：
- source 页 slug 固定为 "source-<source_id 前 8 位>"；传入的 source_slug 就是它
- concept 页 slug 必须来自 existing_pages.slug 里挑（复用），否则新造一个 kebab-case 英文 slug（≤ 40 字符）
- 标题中文无所谓，但 slug 必须 ASCII kebab-case

严格输出 JSON（不要 markdown 围栏）：
{
  "source_page": {
    "slug": "source-xxxxxxxx",
    "title": "原 source 的精炼标题",
    "kind": "source",
    "body_md": "...含 [[wikilinks]]",
    "tags": ["tag1","tag2"]
  },
  "concept_ops": [
    {
      "slug": "asset-vs-liability",
      "title": "资产 vs 负债",
      "kind": "concept",
      "body_md": "...含 [[wikilinks]]",
      "tags": ["..."],
      "aliases": ["资产与负债"]
    }
  ],
  "log_summary": "一句话：这次 ingest 了什么、touch 了几张 page"
}`;

const MAX_RAW_CHARS = 8000; // keep prompt tight — summary + highlights carry most signal
const MAX_EXISTING_PAGES = 120;

export async function ingestSourceToWiki(
  config: ResolvedLlmConfig,
  input: WikiIngestInput,
  opts: { source_slug: string }
): Promise<WikiIngestResult> {
  const { source } = input;
  const rawSlice = source.raw_content?.slice(0, MAX_RAW_CHARS) ?? "";

  const highlightsBlock =
    input.highlights.length > 0
      ? input.highlights
          .map((h, i) => {
            const pieces = [`H${i + 1}: "${h.text.replace(/\n/g, " ").slice(0, 400)}"`];
            if (h.user_journal) pieces.push(`  随记: ${h.user_journal.slice(0, 400)}`);
            if (h.note) pieces.push(`  note: ${h.note.slice(0, 200)}`);
            return pieces.join("\n");
          })
          .join("\n")
      : "(无 highlight)";

  const existingPagesBlock =
    input.existing_pages
      .slice(0, MAX_EXISTING_PAGES)
      .map((p) => `- ${p.slug} [${p.kind}] ${p.title}`)
      .join("\n") || "(wiki 还是空的)";

  const hotConceptsBlock =
    input.hot_concepts
      .map((p) => `### ${p.slug} — ${p.title}\n${p.body_md.slice(0, 600)}`)
      .join("\n\n") || "(无)";

  const userMsg = [
    `# Atlas: ${input.atlas.name}`,
    input.atlas.thesis ? `Thesis: ${input.atlas.thesis}` : null,
    "",
    `# 本次 source (source_slug = ${opts.source_slug})`,
    `Title: ${source.title}`,
    source.author ? `Author: ${source.author}` : null,
    source.url ? `URL: ${source.url}` : null,
    "",
    "## source 的 AI 摘要",
    source.summary?.tl_dr ?? "(无)",
    source.summary?.key_claims?.length
      ? `核心主张：\n${source.summary.key_claims.map((c) => `- ${c}`).join("\n")}`
      : null,
    "",
    "## 用户 highlights 与对应随记",
    highlightsBlock,
    "",
    "## 原文节选（前 8k 字符）",
    rawSlice || "(无正文)",
    "",
    "# 当前 wiki 目录（从里面挑 concept slug 复用；不要造近似 slug）",
    existingPagesBlock,
    "",
    "# 最近活跃的 concept 页面全文（判断是否需要更新）",
    hotConceptsBlock,
  ]
    .filter((x): x is string => !!x)
    .join("\n");

  const raw = await chat(
    config.creds,
    config.models.quality,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.4, max_tokens: 4096, response_format: "json", timeout_ms: 120_000 }
  );

  const parsed = parseJsonLoose<WikiIngestResult>(raw);

  // --- Validate & normalize ---
  if (!parsed.source_page || typeof parsed.source_page.body_md !== "string") {
    throw new Error("wiki ingest: missing source_page");
  }

  const sourcePage: WikiPageOp = {
    slug: opts.source_slug, // never trust LLM for this
    title: String(parsed.source_page.title || source.title).slice(0, 200),
    kind: "source",
    body_md: parsed.source_page.body_md,
    tags: sanitizeTagList(parsed.source_page.tags),
  };

  const conceptOps: WikiPageOp[] = (parsed.concept_ops ?? [])
    .filter((op) => op && typeof op.slug === "string" && typeof op.body_md === "string")
    .slice(0, 4)
    .map<WikiPageOp>((op) => ({
      slug: normalizeSlug(op.slug),
      title: String(op.title || op.slug).slice(0, 200),
      kind: "concept",
      body_md: op.body_md,
      tags: sanitizeTagList(op.tags),
      aliases: sanitizeTagList(op.aliases),
    }))
    .filter((op) => op.slug.length > 0 && op.slug !== opts.source_slug);

  return {
    source_page: sourcePage,
    concept_ops: conceptOps,
    log_summary: String(parsed.log_summary ?? `Ingest: ${source.title}`).slice(0, 300),
  };
}

/** Extract [[slug]] references from a markdown body. */
export function extractWikilinks(body_md: string): string[] {
  const links = new Set<string>();
  const re = /\[\[([^\]|\n]+?)(?:\|[^\]\n]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body_md)) !== null) {
    const target = normalizeSlug(m[1]);
    if (target.length > 0 && target.length <= 80) links.add(target);
  }
  return Array.from(links);
}

function normalizeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "") // ASCII kebab only
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sanitizeTagList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 40)
    .slice(0, 8);
}
