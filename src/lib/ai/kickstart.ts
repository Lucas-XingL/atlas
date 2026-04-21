import { chat } from "@/lib/ai/provider";
import { parseJsonLoose } from "@/lib/ai/json";
import { braveSearch, sleep, type BraveSearchResult } from "@/lib/search/brave";
import type { ResolvedLlmConfig } from "@/lib/ai/resolve-config";
import type { Atlas } from "@/lib/types";

export type CandidateTier = "top" | "recommended" | "further";

export interface KickstartCandidate {
  title: string;
  url: string;
  snippet: string;
  why_relevant: string;
  source_query: string;
  tier: CandidateTier;
}

export interface KickstartResult {
  queries: string[];
  candidates: KickstartCandidate[];
}

const QUERY_GEN_SYSTEM = `你是一个学习领域专家。用户想建立一个主题知识库（Atlas），提供了 name 和 thesis。
你的任务：生成 3-5 个用于 Web 搜索的 query，帮用户找到高质量入门阅读材料。

要求：
- query 之间要覆盖不同角度（历史脉络 / 核心概念 / 实践案例 / 争议观点 / 近期进展）
- 优先用英文 query（英文搜索结果质量通常更高），除非主题是中文语境特有（如 A 股、房地产政策）
- 避免过于泛（"investing"）或过于细（特定股票代码）
- 每个 query 10-15 个词以内

严格输出 JSON（不要 markdown 围栏）：
{"queries": ["q1", "q2", "q3", "q4"]}`;

const RANK_SYSTEM = `你是一个学习资源策展人。用户在建立主题 Atlas，我从 Web 搜索拉来一批候选，请你筛选并分档。

档位定义：
- "top"：3-4 条灯塔级，新手必读、领域共识的代表作
- "recommended"：3-5 条重要参考，来自知名作者或深度分析，有独到视角
- "further"：2-3 条可选补充，小众但有启发

要求：
- 总数 8-12 条
- 剔除营销 / SEO 垃圾 / 过度简化的入门 blog
- why_relevant 必须具体，不要"这是一篇好文章"这种废话
- why_relevant 避免使用双引号（用单引号或中文引号 '' 代替）
- url 必须来自 candidates 列表，不要自己编

严格输出 JSON（不要 markdown 围栏，不要尾随逗号）：
{
  "picks": [
    {"url": "...", "tier": "top", "why_relevant": "..."},
    {"url": "...", "tier": "recommended", "why_relevant": "..."},
    {"url": "...", "tier": "further", "why_relevant": "..."}
  ]
}`;

const DEFAULT_QUERY_COUNT = 4;
const RESULTS_PER_QUERY = 8;
const MAX_PICKS = 12;

/**
 * Step 1 only: LLM drafts search queries. Fast (~3-5s).
 */
export async function generateKickstartQueries(
  llm: ResolvedLlmConfig,
  atlas: Pick<Atlas, "name" | "thesis" | "tags">
): Promise<string[]> {
  const userMsg = [
    `Atlas name: ${atlas.name}`,
    atlas.thesis ? `Thesis: ${atlas.thesis}` : null,
    atlas.tags?.length ? `Tags: ${atlas.tags.join(", ")}` : null,
    "",
    `请生成 ${DEFAULT_QUERY_COUNT} 个 query。`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat(
    llm.creds,
    llm.models.quality,
    [
      { role: "system", content: QUERY_GEN_SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.7, max_tokens: 512, response_format: "json", timeout_ms: 60_000 }
  );

  const parsed = parseJsonLoose<{ queries: string[] }>(raw);
  const queries = (parsed.queries ?? [])
    .filter((q) => typeof q === "string" && q.trim().length > 0)
    .slice(0, DEFAULT_QUERY_COUNT);

  if (queries.length === 0) throw new Error("LLM failed to generate search queries");
  return queries;
}

/**
 * Step 2: given queries, run Brave searches + LLM ranking + tier classification.
 */
export async function searchAndRank(
  llm: ResolvedLlmConfig,
  braveApiKey: string,
  atlas: Pick<Atlas, "name" | "thesis">,
  queries: string[]
): Promise<KickstartCandidate[]> {
  const candidateMap = new Map<string, KickstartCandidate>();

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      const results = await braveSearch(braveApiKey, q, { count: RESULTS_PER_QUERY });
      for (const r of results) {
        if (!r.url || candidateMap.has(r.url)) continue;
        candidateMap.set(r.url, {
          title: r.title,
          url: r.url,
          snippet: r.description ?? "",
          why_relevant: "",
          source_query: q,
          tier: "recommended",
        });
      }
    } catch (err) {
      console.error("[kickstart] brave search failed", { query: q, err });
    }
    if (i < queries.length - 1) await sleep(1100); // stay under 1 QPS
  }

  const allCandidates = Array.from(candidateMap.values());
  if (allCandidates.length === 0) return [];

  return rankAndTag(llm, atlas, allCandidates);
}

async function rankAndTag(
  llm: ResolvedLlmConfig,
  atlas: Pick<Atlas, "name" | "thesis">,
  candidates: KickstartCandidate[]
): Promise<KickstartCandidate[]> {
  const compact = candidates.slice(0, 40).map((c) => ({
    url: c.url,
    title: c.title,
    snippet: c.snippet.slice(0, 180),
  }));

  const userMsg = [
    `Atlas: ${atlas.name}`,
    atlas.thesis ? `Thesis: ${atlas.thesis}` : null,
    "",
    `候选（${compact.length} 条，请挑 8-12 条并分档）：`,
    JSON.stringify(compact, null, 2),
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat(
    llm.creds,
    llm.models.quality,
    [
      { role: "system", content: RANK_SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.3, max_tokens: 2048, response_format: "json", timeout_ms: 90_000 }
  );

  let parsed: { picks: Array<{ url: string; tier?: string; why_relevant?: string }> };
  try {
    parsed = parseJsonLoose(raw);
  } catch (err) {
    console.error("[kickstart] rank parse failed, using raw top-N fallback", err);
    return fallbackTopN(candidates);
  }

  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  const output: KickstartCandidate[] = [];
  for (const pick of parsed.picks ?? []) {
    const match = byUrl.get(pick.url);
    if (!match) continue;
    output.push({
      ...match,
      tier: normalizeTier(pick.tier),
      why_relevant: (pick.why_relevant ?? "").slice(0, 400),
    });
    if (output.length >= MAX_PICKS) break;
  }

  if (output.length < 3) return fallbackTopN(candidates);
  return output;
}

function normalizeTier(input: unknown): CandidateTier {
  const v = String(input ?? "").toLowerCase();
  if (v === "top") return "top";
  if (v === "further") return "further";
  return "recommended";
}

function fallbackTopN(candidates: KickstartCandidate[]): KickstartCandidate[] {
  return candidates.slice(0, 10).map((c, i) => ({
    ...c,
    tier: i < 3 ? "top" : i < 7 ? "recommended" : "further",
  }));
}
