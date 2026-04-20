import { createSupabaseServer } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import type { UserSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<UserSettings>();

  const safe: (UserSettings & { llm_api_key: string | null }) | null = data
    ? { ...data, llm_api_key: data.llm_api_key ? "***" : null }
    : null;

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        LLM 厂商、API key、时区、晨间推送。
      </p>
      <div className="mt-8">
        <SettingsForm initial={safe} />
      </div>
    </div>
  );
}
