import { chat } from "@/lib/ai/provider";
import { parseJsonLoose } from "@/lib/ai/json";
import type { ResolvedLlmConfig } from "@/lib/ai/resolve-config";
import type { Atlas, Flashcard, JournalEntry } from "@/lib/types";

export interface DistillInputEntry {
  id: string;
  text: string;
  created_at: string;
}

export interface DistilledCard {
  front: string;
  back: string;
  origin_ids: string[];
}

export interface DistillResult {
  cards: DistilledCard[];
  /** journal ids the model decided were not worth distilling */
  archived_ids: string[];
}

const SYSTEM = `你是 Atlas 的 distill agent。用户每天有 0-50 条随记 (journal entries)。
你的任务：把反复出现、有观点价值的随记提炼为 flashcard (问答对)。

规则（严格遵守）：
- 必须至少 2 条 journal 相互呼应才能生成一张 card（孤立的单条不做 card）
- front 是问题形式（例如："Harness 和 context engineering 的关系？"）
- back 是用户观点 + 支撑依据（≤ 120 字）
- 避免与 existing_cards 重复
- 情绪/吐槽/零散想法 → 放入 archived_ids
- 所有输入的 journal id 必须出现在 cards[*].origin_ids 或 archived_ids 中，不得遗漏
- 输出严格 JSON，不要 markdown 围栏

输出格式：
{
  "cards": [
    {
      "front": "问题形式",
      "back": "观点形式，含依据",
      "origin_ids": ["id1", "id2"]
    }
  ],
  "archived_ids": ["idN", ...]
}`;

export async function distillJournal(
  config: ResolvedLlmConfig,
  atlas: Pick<Atlas, "id" | "name" | "thesis">,
  entries: DistillInputEntry[],
  existingCards: Array<Pick<Flashcard, "front" | "back">>
): Promise<DistillResult> {
  if (entries.length === 0) {
    return { cards: [], archived_ids: [] };
  }

  const existingSummary = existingCards
    .slice(0, 30)
    .map((c, i) => `${i + 1}. Q: ${c.front} / A: ${c.back.slice(0, 60)}`)
    .join("\n");

  const userMsg = [
    `Atlas: ${atlas.name}`,
    atlas.thesis ? `Thesis: ${atlas.thesis}` : null,
    "",
    "# Journal entries (JSON)",
    JSON.stringify(entries.map((e) => ({ id: e.id, text: e.text })), null, 2),
    "",
    "# Existing flashcards (avoid duplicates)",
    existingSummary || "(none)",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat(
    config.creds,
    config.models.quality,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.4, max_tokens: 2048, response_format: "json", timeout_ms: 90_000 }
  );

  const parsed = parseJsonLoose<DistillResult>(raw);

  const allInputIds = new Set(entries.map((e) => e.id));
  const cards = (parsed.cards ?? [])
    .filter((c) => c.front && c.back && Array.isArray(c.origin_ids) && c.origin_ids.length > 0)
    .map((c) => ({
      ...c,
      origin_ids: c.origin_ids.filter((id) => allInputIds.has(id)),
    }))
    .filter((c) => c.origin_ids.length > 0);

  const archived = (parsed.archived_ids ?? []).filter((id) => allInputIds.has(id));

  return { cards, archived_ids: archived };
}

export interface WeeklyDigestInput {
  atlas: Pick<Atlas, "name" | "thesis">;
  period_start: string;
  period_end: string;
  stats: {
    journal_count: number;
    new_cards: number;
    sources_read: number;
    reviews: number;
    retention_rate: number;
  };
  journal_samples: string[];
  card_samples: Array<{ front: string; back: string; success_count: number }>;
  source_titles: string[];
}

const DIGEST_SYSTEM = `你是 Atlas 的周报作者。用"你"的口吻，写 200-300 字中文 markdown 周报。

要求：
- 识别本周反复出现的"主题线索"
- 指出 1-2 张成熟度高、可以写成 synthesis 的 flashcard（若有）
- 指出 1-2 个 knowledge gap（读得少但聊得多的主题）
- 语气克制，像一个敏锐的朋友，不要夸奖式营销语
- 只输出 markdown，不要 JSON 外壳`;

export async function generateWeeklyDigest(
  config: ResolvedLlmConfig,
  input: WeeklyDigestInput
): Promise<string> {
  const userMsg = [
    `Atlas: ${input.atlas.name}`,
    input.atlas.thesis ? `Thesis: ${input.atlas.thesis}` : null,
    `Period: ${input.period_start} → ${input.period_end}`,
    "",
    "## 本周数据",
    JSON.stringify(input.stats, null, 2),
    "",
    "## Journal 样本",
    input.journal_samples.slice(0, 15).map((t, i) => `${i + 1}. ${t.slice(0, 200)}`).join("\n") || "(无)",
    "",
    "## 新 flashcard 样本",
    input.card_samples.slice(0, 10).map((c) => `- Q: ${c.front}\n  A: ${c.back}`).join("\n") || "(无)",
    "",
    "## 本周 source 标题",
    input.source_titles.slice(0, 10).join("\n") || "(无)",
  ]
    .filter(Boolean)
    .join("\n");

  return await chat(
    config.creds,
    config.models.quality,
    [
      { role: "system", content: DIGEST_SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.6, max_tokens: 800, timeout_ms: 90_000 }
  );
}
