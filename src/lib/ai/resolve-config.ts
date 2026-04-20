import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmProvider, UserSettings } from "@/lib/types";
import {
  type ModelChoice,
  type ProviderCredentials,
  defaultModels,
} from "@/lib/ai/provider";

export interface ResolvedLlmConfig {
  creds: ProviderCredentials;
  models: ModelChoice;
}

/**
 * Resolve a user's LLM credentials. Priority:
 *  1. User-provided API key in user_settings.llm_api_key
 *  2. Fallback env var (ZHIPU_API_KEY / MINIMAX_API_KEY) for dev.
 */
export async function resolveLlmConfig(
  supabase: SupabaseClient,
  userId: string
): Promise<ResolvedLlmConfig> {
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single<UserSettings>();

  if (error || !settings) {
    throw new Error(`user_settings not found for ${userId}: ${error?.message}`);
  }

  const provider: LlmProvider = settings.llm_provider;
  const apiKey = settings.llm_api_key || fallbackEnvKey(provider);

  if (!apiKey) {
    throw new Error(
      `No LLM api key for provider=${provider}. Set it in Settings or ${envVarName(provider)}.`
    );
  }

  const defaults = defaultModels(provider);

  return {
    creds: {
      provider,
      api_key: apiKey,
      minimax_group_id:
        settings.minimax_group_id || process.env.MINIMAX_GROUP_ID || undefined,
    },
    models: {
      quality: settings.llm_model_quality || defaults.quality,
      fast: settings.llm_model_fast || defaults.fast,
    },
  };
}

function fallbackEnvKey(provider: LlmProvider): string | undefined {
  if (provider === "minimax") return process.env.MINIMAX_API_KEY;
  return process.env.ZHIPU_API_KEY;
}

function envVarName(provider: LlmProvider): string {
  return provider === "minimax" ? "MINIMAX_API_KEY" : "ZHIPU_API_KEY";
}
