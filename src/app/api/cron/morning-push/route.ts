import { NextResponse } from "next/server";
import { createSupabaseServiceRole } from "@/lib/supabase/server";
import { sendEmail, renderMorningEmail } from "@/lib/notify/email";

export const runtime = "nodejs";
export const maxDuration = 120;

interface UserSettingsRow {
  user_id: string;
  timezone: string;
  morning_ritual_time: string;
  email_push_enabled: boolean;
}

export async function POST(request: Request) {
  const auth = request.headers.get("x-cron-secret");
  if (auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRole();

  const { data: settings } = await admin
    .from("user_settings")
    .select("user_id, timezone, morning_ritual_time, email_push_enabled")
    .eq("email_push_enabled", true);

  const now = new Date();
  const results: Array<{ user_id: string; pushed: boolean; error?: string }> = [];

  for (const s of (settings ?? []) as UserSettingsRow[]) {
    try {
      if (!shouldPushNow(now, s.timezone, s.morning_ritual_time)) {
        continue;
      }
      const pushed = await pushOne(admin, s.user_id);
      results.push({ user_id: s.user_id, pushed });
    } catch (err) {
      results.push({
        user_id: s.user_id,
        pushed: false,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({ candidates: settings?.length ?? 0, results });
}

/**
 * Returns true if the user's local hour matches their morning_ritual_time hour.
 * We only schedule one push per day: the cron runs hourly and we filter here.
 */
function shouldPushNow(utcNow: Date, timezone: string, ritualTime: string): boolean {
  const hh = Number(ritualTime.slice(0, 2));
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    });
    const localHour = Number(fmt.format(utcNow));
    return localHour === hh;
  } catch {
    return false;
  }
}

async function pushOne(
  admin: ReturnType<typeof createSupabaseServiceRole>,
  userId: string
): Promise<boolean> {
  // Due cards (≤ 4h in the future)
  const { data: due } = await admin
    .from("flashcards")
    .select("id, front, atlas:atlases(name)")
    .eq("user_id", userId)
    .lte("next_review_at", new Date(Date.now() + 4 * 3600_000).toISOString())
    .order("next_review_at", { ascending: true })
    .limit(5);

  // Newly distilled flashcards in last 24h
  const { count: newCount } = await admin
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());

  if ((due?.length ?? 0) === 0 && (newCount ?? 0) === 0) return false;

  // Look up email via auth.users
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData.user?.email;
  if (!email) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://atlas.example.com";
  const html = renderMorningEmail({
    due_cards: (due ?? []).map((c) => ({
      front: c.front,
      atlas: (c.atlas as { name?: string } | null)?.name ?? "Atlas",
    })),
    new_cards: newCount ?? 0,
    app_url: appUrl,
  });

  await sendEmail({
    to: email,
    subject: `🌅 Atlas · 今日 ${due?.length ?? 0} 张卡${(newCount ?? 0) > 0 ? ` · 新 ${newCount} 张` : ""}`,
    html,
  });

  return true;
}
