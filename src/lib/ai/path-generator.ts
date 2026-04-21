import { chat } from "@/lib/ai/provider";
import { parseJsonLoose } from "@/lib/ai/json";
import type { ResolvedLlmConfig } from "@/lib/ai/resolve-config";
import type { Atlas, KnowledgeDomain, PathResourceTier, ResourceType } from "@/lib/types";

export interface GeneratedResource {
  tier: PathResourceTier;
  resource_type: ResourceType;
  title: string;
  url: string | null;
  author: string | null;
  why_relevant: string | null;
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
   - resource_type:
     · "consumable": 能直接抓取阅读的（博客、论文、公开课页面、免费视频文字稿）
     · "external": 需外部消化的（YouTube 视频、播客、付费文章、知识星球）
     · "physical": 实体书、线下课程
   - title: 具体的书名 / 文章名 / 视频名（不要泛指，要能搜到）
   - url: 公开 URL 时给，不确定就留 null
   - author: 作者/创作者（若已知）
   - why_relevant: 为什么在这个 Stage 读它（≤80 字）
   - search_hint: url 为 null 时，给用户搜索线索（ISBN、作者名+关键词、平台）

规则：
- 每个 Stage 的 core 是"最小闭环"，读完 core 就能进下一 Stage
- 不要推荐过时/已被取代的资源
- 中文主题优先中文资源；学术/技术优先英文
- 主题小众时不强凑 6 个 Stage，3 个也可以
- 不要推荐你不确定存在的具体 URL；不确定就留 null + search_hint
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
          "resource_type": "physical",
          "title": "《富爸爸穷爸爸》",
          "url": null,
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

const RESOURCE_TYPES: ResourceType[] = ["consumable", "external", "physical"];

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

function normalize(raw: Partial<GeneratedPath>): GeneratedPath {
  const domain = DOMAINS.includes(raw.knowledge_domain as KnowledgeDomain)
    ? (raw.knowledge_domain as KnowledgeDomain)
    : "other";
  const stages: GeneratedStage[] = Array.isArray(raw.stages)
    ? raw.stages.filter((s) => s && typeof s.name === "string").map(normalizeStage)
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

function normalizeStage(stage: any): GeneratedStage {
  const resources: GeneratedResource[] = Array.isArray(stage.resources)
    ? stage.resources.filter((r: any) => r && typeof r.title === "string").map(normalizeResource)
    : [];
  return {
    name: String(stage.name).slice(0, 80),
    intent: stage.intent ? String(stage.intent).slice(0, 300) : null,
    est_duration: stage.est_duration ? String(stage.est_duration).slice(0, 40) : null,
    resources,
  };
}

function normalizeResource(r: any): GeneratedResource {
  const tier: PathResourceTier = r.tier === "extra" ? "extra" : "core";
  const rt = r.resource_type as ResourceType;
  const resource_type: ResourceType = RESOURCE_TYPES.includes(rt) ? rt : "consumable";
  return {
    tier,
    resource_type,
    title: String(r.title).slice(0, 200),
    url: r.url && typeof r.url === "string" && /^https?:\/\//.test(r.url) ? r.url : null,
    author: r.author ? String(r.author).slice(0, 100) : null,
    why_relevant: r.why_relevant ? String(r.why_relevant).slice(0, 400) : null,
    search_hint: r.search_hint ? String(r.search_hint).slice(0, 200) : null,
  };
}
