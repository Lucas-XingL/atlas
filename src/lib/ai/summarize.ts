import { chat } from "@/lib/ai/provider";
import { parseJsonLoose } from "@/lib/ai/json";
import type { ResolvedLlmConfig } from "@/lib/ai/resolve-config";
import type { SourceSummary } from "@/lib/types";

const SYSTEM = `你是一位精炼的阅读助手。阅读给定的文章 markdown，输出严格 JSON：
{
  "tl_dr": "一段 ≤120 字的中文摘要",
  "key_claims": ["作者核心主张 1", "主张 2", "主张 3 (3-5 条)"],
  "quotes": [{"text": "原文金句，30-80 字"}, ...最多 3 条]
}
规则：
- 只输出 JSON，不要 markdown 围栏
- key_claims 用陈述句，不要问题
- quotes 必须是原文摘录（若找不到就返回空数组）
- 若文章明显是营销/空洞内容，tl_dr 写 "内容信息密度低，跳过"`;

const MAX_CHARS = 18_000; // ≈ 6k tokens, fits GLM-4.7-FlashX comfortably

export async function summarizeSource(
  config: ResolvedLlmConfig,
  opts: { title: string; url: string | null; markdown: string }
): Promise<SourceSummary> {
  const md = opts.markdown.slice(0, MAX_CHARS);
  const userMsg = [
    opts.url ? `URL: ${opts.url}` : null,
    `TITLE: ${opts.title}`,
    "",
    md,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat(
    config.creds,
    config.models.fast,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
    { temperature: 0.2, max_tokens: 1024, response_format: "json", timeout_ms: 60_000 }
  );

  const parsed = parseJsonLoose<SourceSummary>(raw);
  return {
    tl_dr: parsed.tl_dr ?? "",
    key_claims: Array.isArray(parsed.key_claims) ? parsed.key_claims : [],
    quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
  };
}
