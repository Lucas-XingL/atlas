import type { LlmProvider } from "@/lib/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: "text" | "json";
  timeout_ms?: number;
}

export interface ProviderCredentials {
  provider: LlmProvider;
  api_key: string;
  minimax_group_id?: string;
}

export interface ModelChoice {
  /** High-quality model: used for distill & weekly-digest. */
  quality: string;
  /** Lightweight / fast model: used for source summaries. */
  fast: string;
}

export function defaultModels(provider: LlmProvider): ModelChoice {
  if (provider === "minimax") {
    return { quality: "MiniMax-M2.7", fast: "MiniMax-M2.7-highspeed" };
  }
  return { quality: "glm-5.1", fast: "glm-4.7-flashx" };
}

const DEFAULT_TIMEOUT = 90_000;

interface OpenAiChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  [k: string]: unknown;
}

/**
 * Call the LLM using an OpenAI-compatible ChatCompletion endpoint.
 *
 * - Zhipu GLM: https://docs.bigmodel.cn  OpenAI-compat base url:
 *   https://open.bigmodel.cn/api/paas/v4
 *   POST /chat/completions with Bearer <api_key>.
 *
 * - MiniMax: https://api.minimaxi.com/v1 (newer OpenAI-compat endpoint)
 *   POST /text/chatcompletion_v2  Bearer <api_key>  with `MM-API-Source: Chat-Completion-v2`
 *   — MiniMax also exposes /chat/completions at api.minimax.chat; we target the documented v2.
 */
export async function chat(
  creds: ProviderCredentials,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const { provider, api_key } = creds;
  const timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT;
  const maxAttempts = 3;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { url, body, headers } = buildRequest(provider, api_key, model, messages, options, creds);

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const retriable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 529;
        if (retriable && attempt < maxAttempts) {
          lastError = new Error(`LLM ${provider} http ${res.status} (attempt ${attempt})`);
          clearTimeout(t);
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`LLM ${provider} http ${res.status}: ${errText.slice(0, 400)}`);
      }

      const json = (await res.json()) as OpenAiChatResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`LLM ${provider} returned no content`);
      }
      return content;
    } catch (err) {
      if (attempt < maxAttempts && err instanceof Error && err.name === "AbortError") {
        lastError = err;
        clearTimeout(t);
        continue;
      }
      clearTimeout(t);
      throw err;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastError ?? new Error("LLM chat exhausted retries");
}

function buildRequest(
  provider: LlmProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions,
  creds: ProviderCredentials
): { url: string; body: Record<string, unknown>; headers: Record<string, string> } {
  const common = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 2048,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === "zhipu") {
    // Zhipu OpenAI-compatible ChatCompletion endpoint.
    const body: Record<string, unknown> = { ...common };
    if (options.response_format === "json") {
      // GLM supports response_format { type: 'json_object' } on capable models.
      body.response_format = { type: "json_object" };
    }
    return {
      url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      body,
      headers,
    };
  }

  // MiniMax v2 ChatCompletion (OpenAI-compat payload on api.minimaxi.com)
  const body: Record<string, unknown> = { ...common };
  if (creds.minimax_group_id) {
    body.group_id = creds.minimax_group_id;
  }
  return {
    url: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
    body,
    headers,
  };
}
