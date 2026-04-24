import { chat } from "@/lib/ai/provider";
import { parseJsonLoose } from "@/lib/ai/json";
import type { ResolvedLlmConfig } from "@/lib/ai/resolve-config";
import type { Atlas, KnowledgeDomain, PathResourceTier } from "@/lib/types";

/**
 * Path generator (v2 — human-sources).
 *
 * Previously the AI was asked to guess URLs and distinguish
 * consumable/external/physical resource types. Both proved unreliable:
 * hallucinated URLs 404'd, 'consumable' links often hid behind paywalls or
 * anti-scraping, and the resource_type heuristic was wrong often enough to
 * pollute downstream UX.
 *
 * The new contract: the AI only outputs *what to read*, not *where*. Every
 * resource comes out neutral; the user provides the actual content (URL,
 * PDF/EPUB upload, or pasted text) at the 开始读 step. This makes path
 * generation a pure curation task, which the LLM does well.
 */

export interface GeneratedResource {
  tier: PathResourceTier;
  title: string;
  author: string | null;
  why_relevant: string | null;
  /**
   * Concrete pointer the user can use to find the resource themselves:
   * ISBN, arxiv id, author + keyword, platform name, etc. Required.
   */
  search_hint: string | null;
}

export interface GeneratedStage {
  name: string;
  intent: string | null;
  est_duration: string | null;
  resources: GeneratedResource[];
}

export interface GeneratedPath {
  knowledge_domain: KnowledgeDomain;
  overview: string;
  stages: GeneratedStage[];
}

const SYSTEM = `你是一个学习路径规划师。用户要建立一个主题知识库，给了 name 和 thesis。
你的唯一任务是给出"读什么"的清单 — 不要给 URL，不要判断资源是"在线/线下/付费"。
用户会自己提供实际载体（链接/上传 PDF/粘贴原文）。

按 3 步规划路径：

1. 判定 knowledge_domain（必填，枚举之一）：
   tech / finance / art / science / practical / humanities / other

2. 按该域的经典学习脉络生成 3-6 个 Stage：
   - tech: 基础概念 → 官方文档 → 小项目 → 架构/源码 → 进阶专题
   - finance: 心法认知 → 工具理论 → 小额实操 → 组合策略 → 深度研究
   - art: 审美积累 → 技法模仿 → 独立创作 → 风格形成
   - science: 教科书 → 综述 → 前沿论文 → 自己复现
   - practical: 核心操作 → 常见坑 → 进阶技巧 → 精通
   - humanities: 原典 → 注疏 → 当代研究 → 横向对话
   - other: 按用户 thesis 自行设计
   每 Stage 给 name / intent（一句话目标）/ est_duration（软提示，如 "1 周"、"持续"）

3. 每 Stage 给 3-6 个 Resource：
   - tier: "core"（3-4 条必读）或 "extra"（0-2 条拓展）
   - title: 具体的书名 / 文章名 / 视频名 / 课程名（不要泛指，要能搜到）
   - author: 作者/创作者（若已知）
   - why_relevant: 为什么在这个 Stage 读它（≤80 字）
   - search_hint: 必填。用户找源的线索：ISBN、arxiv id、平台 + 关键词、官方网址域名等

规则：
- 每个 Stage 的 core 是"最小闭环"，读完 core 就能进下一 Stage
- 不要推荐过时/已被取代的资源
- 中文主题优先中文资源；学术/技术优先英文
- 主题小众时不强凑 6 个 Stage，3 个也可以
- 禁止输出 url 字段。禁止输出 resource_type 字段
- 严格输出 JSON，不要 markdown 围栏
- 所有字符串内部禁止出现双引号（用单引号或中文引号）

输出严格 JSON schema：
{
  "knowledge_domain": "...",
  "overview": "3-5 句总览，为什么这样设计",
  "stages": [
    {
      "name": "心法建立",
      "intent": "建立资产/负债的基本认知",
      "est_duration": "1 周",
      "resources": [
        {
          "tier": "core",
          "title": "《富爸爸穷爸爸》",
          "author": "罗伯特·清崎",
          "why_relevant": "建立理财心态的标杆入门",
          "search_hint": "ISBN 978-7-5062-8940-7"
        }
      ]
    }
  ]
}`;

const DOMAINS: KnowledgeDomain[] = [
  "tech",
  "finance",
  "art",
  "science",
  "practical",
  "humanities",
  "other",
];

export async function generateLearningPath(
  llm: ResolvedLlmConfig,
  atlas: Pick<Atlas, "name" | "thesis" | "tags">
): Promise<GeneratedPath> {
  const userMsg = [
    `Atlas name: ${atlas.name}`,
    atlas.thesis ? `Thesis: ${atlas.thesis}` : null,
    atlas.tags?.length ? `Tags: ${atlas.tags.join(", ")}` : null,
    "",
    "请按上述 schema 生成学习路径。",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat(
    llm.creds,
    llm.models.quality,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.55, max_tokens: 3500, response_format: "json", timeout_ms: 120_000 }
  );

  const parsed = parseJsonLoose<Partial<GeneratedPath>>(raw);
  return normalize(parsed);
}

const STAGE_SYSTEM = `你是一个学习路径规划师。用户已经有一条路径，现在只想重新生成其中一个 Stage 的资源列表。
上下文：用户会给你 atlas 的主题、当前这个 Stage 的名字/目标/时长，以及其它 Stage 的概览（避免内容重复）。
还可能给你反馈：比如"资源太理论了，想要偏工程的"，你必须按反馈调整方向。

重要：你只给"读什么"，不给 URL，不判断 online/offline。用户自己提供载体。

输出严格 JSON：
{
  "resources": [
    {
      "tier": "core" | "extra",
      "title": "...",
      "author": "..." 或 null,
      "why_relevant": "≤80 字",
      "search_hint": "必填：找源线索（ISBN/平台/关键词）"
    }
  ]
}

规则：
- 3-6 条 resources，其中 3-4 条 core + 0-2 条 extra
- tier=core 是"最小闭环"
- 不推荐过时资源
- 不要输出 url 或 resource_type 字段
- 不要与其它 Stage 的内容重复
- 严格 JSON，不要 markdown 围栏
- 字符串内不要出现双引号（用单引号或中文引号）`;

export interface StageContext {
  atlas: Pick<Atlas, "name" | "thesis" | "tags">;
  stage: { name: string; intent: string | null; est_duration: string | null };
  sibling_stages: { name: string; intent: string | null }[];
  feedback?: string | null;
}

export async function generateStageResources(
  llm: ResolvedLlmConfig,
  ctx: StageContext
): Promise<GeneratedResource[]> {
  const siblingLines = ctx.sibling_stages
    .map((s, i) => `${i + 1}. ${s.name}${s.intent ? ` — ${s.intent}` : ""}`)
    .join("\n");

  const userMsg = [
    `Atlas: ${ctx.atlas.name}`,
    ctx.atlas.thesis ? `Thesis: ${ctx.atlas.thesis}` : null,
    "",
    `当前 Stage：${ctx.stage.name}`,
    ctx.stage.intent ? `目标：${ctx.stage.intent}` : null,
    ctx.stage.est_duration ? `预计时长：${ctx.stage.est_duration}` : null,
    "",
    siblingLines ? `其它 Stage（避免重复）：\n${siblingLines}` : null,
    "",
    ctx.feedback ? `用户反馈 / 方向：${ctx.feedback}` : null,
    "",
    "请只为当前 Stage 生成 resources。",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat(
    llm.creds,
    llm.models.quality,
    [
      { role: "system", content: STAGE_SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.55, max_tokens: 2000, response_format: "json", timeout_ms: 90_000 }
  );

  const parsed = parseJsonLoose<{ resources?: unknown }>(raw);
  const resources = Array.isArray(parsed.resources)
    ? parsed.resources
        .filter((r: unknown): r is Record<string, unknown> =>
          !!r && typeof (r as { title?: unknown }).title === "string"
        )
        .map(normalizeResource)
    : [];
  if (resources.length === 0) {
    throw new Error("Stage regeneration returned no valid resources");
  }
  return resources;
}

function normalize(raw: Partial<GeneratedPath>): GeneratedPath {
  const domain = DOMAINS.includes(raw.knowledge_domain as KnowledgeDomain)
    ? (raw.knowledge_domain as KnowledgeDomain)
    : "other";
  const stages: GeneratedStage[] = Array.isArray(raw.stages)
    ? raw.stages
        .filter((s): s is GeneratedStage => !!s && typeof s.name === "string")
        .map((s) => normalizeStage(s as unknown as Record<string, unknown>))
    : [];
  if (stages.length === 0) {
    throw new Error("Generated path has no valid stages");
  }
  return {
    knowledge_domain: domain,
    overview: typeof raw.overview === "string" ? raw.overview : "",
    stages,
  };
}

function normalizeStage(stage: Record<string, unknown>): GeneratedStage {
  const rawResources = Array.isArray(stage.resources) ? stage.resources : [];
  const resources: GeneratedResource[] = rawResources
    .filter((r: unknown): r is Record<string, unknown> =>
      !!r && typeof (r as { title?: unknown }).title === "string"
    )
    .map(normalizeResource);
  return {
    name: String(stage.name).slice(0, 80),
    intent: stage.intent ? String(stage.intent).slice(0, 300) : null,
    est_duration: stage.est_duration ? String(stage.est_duration).slice(0, 40) : null,
    resources,
  };
}

function normalizeResource(r: Record<string, unknown>): GeneratedResource {
  const tier: PathResourceTier = r.tier === "extra" ? "extra" : "core";
  return {
    tier,
    title: String(r.title).slice(0, 200),
    author: r.author ? String(r.author).slice(0, 100) : null,
    why_relevant: r.why_relevant ? String(r.why_relevant).slice(0, 400) : null,
    search_hint: r.search_hint ? String(r.search_hint).slice(0, 200) : null,
  };
}
