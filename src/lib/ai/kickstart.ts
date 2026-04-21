import { chat } from "@/lib/ai/provider";
import { parseJsonLoose } from "@/lib/ai/json";
import { braveSearch, sleep, type BraveSearchResult } from "@/lib/search/brave";
import type { ResolvedLlmConfig } from "@/lib/ai/resolve-config";
import type { Atlas } from "@/lib/types";

export interface KickstartCandidate {
  title: string;
  url: string;
  snippet: string;
  why_relevant: string;
  source_query: string;
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
- 输出严格 JSON：{"queries": ["q1","q2",...]}`;

const RANK_SYSTEM = `你是一个学习资源策展人。用户要为主题建立 Atlas，我已经从 Web 搜索拉来了一批候选。
你的任务：从候选中挑选 8-12 条最值得读的，每条给一句"为什么值得读"。

要求：
- 剔除营销 / SEO 垃圾 / 过度简化的入门 blog
- 优先原始论文 / 经典文章 / 业界深度分析 / 知名作者博客
- 覆盖不同深度：有入门的有进阶的
- why_relevant 必须具体，不要"这是一篇好文章"这种废话
- 输出严格 JSON：{"picks": [{"url":"...","why_relevant":"..."}, ...]}
- url 必须来自 candidates，不要自己编`;

const DEFAULT_QUERY_COUNT = 4;
const RESULTS_PER_QUERY = 8;
const MIN_PICKS = 6;
const MAX_PICKS = 12;

export async function runKickstart(
  llm: ResolvedLlmConfig,
  braveApiKey: string,
  atlas: Pick<Atlas, "name" | "thesis" | "tags">
): Promise<KickstartResult> {
  // Step 1: LLM generates queries
  const queries = await generateQueries(llm, atlas);

  // Step 2: Run Brave search serially (1 QPS free tier)
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
        });
      }
    } catch (err) {
      console.error("[kickstart] brave search failed", { query: q, err });
    }
    if (i < queries.length - 1) await sleep(1100); // stay under 1 QPS
  }

  const allCandidates = Array.from(candidateMap.values());
  if (allCandidates.length === 0) {
    return { queries, candidates: [] };
  }

  // Step 3: LLM picks the best + writes why_relevant for each
  const picked = await rankCandidates(llm, atlas, allCandidates);
  return { queries, candidates: picked };
}

async function generateQueries(
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

  if (queries.length === 0) {
    throw new Error("LLM failed to generate search queries");
  }
  return queries;
}

async function rankCandidates(
  llm: ResolvedLlmConfig,
  atlas: Pick<Atlas, "name" | "thesis">,
  candidates: KickstartCandidate[]
): Promise<KickstartCandidate[]> {
  // Keep the payload small
  const compact = candidates.slice(0, 40).map((c) => ({
    url: c.url,
    title: c.title,
    snippet: c.snippet.slice(0, 200),
  }));

  const userMsg = [
    `Atlas: ${atlas.name}`,
    atlas.thesis ? `Thesis: ${atlas.thesis}` : null,
    "",
    `请从以下 ${compact.length} 个候选中挑 ${MIN_PICKS}-${MAX_PICKS} 条（JSON 数组）：`,
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
    { temperature: 0.4, max_tokens: 2048, response_format: "json", timeout_ms: 90_000 }
  );

  const parsed = parseJsonLoose<{ picks: Array<{ url: string; why_relevant: string }> }>(raw);
  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  const output: KickstartCandidate[] = [];
  for (const pick of parsed.picks ?? []) {
    const match = byUrl.get(pick.url);
    if (!match) continue;
    output.push({
      ...match,
      why_relevant: pick.why_relevant ?? "",
    });
    if (output.length >= MAX_PICKS) break;
  }

  // If the LLM didn't pick enough, fall back to top candidates without why_relevant
  if (output.length < MIN_PICKS) {
    for (const c of candidates) {
      if (output.find((o) => o.url === c.url)) continue;
      output.push(c);
      if (output.length >= MIN_PICKS) break;
    }
  }

  return output;
}
