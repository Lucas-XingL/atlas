import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL || "Atlas <onboarding@resend.dev>";

  if (!resend) {
    console.warn("[notify/email] RESEND_API_KEY not set, skipping", { to, subject });
    return;
  }

  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

export function renderMorningEmail(args: {
  due_cards: Array<{ front: string; atlas: string }>;
  new_cards: number;
  app_url: string;
}): string {
  const { due_cards, new_cards, app_url } = args;
  const cardList = due_cards
    .slice(0, 5)
    .map(
      (c) =>
        `<li style="margin:8px 0;color:#e4e4e7;"><strong style="color:#a78bfa;">${escape(c.atlas)}</strong> · ${escape(c.front)}</li>`
    )
    .join("");

  return `
<div style="font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e4e4e7;padding:32px;max-width:560px;margin:0 auto;">
  <h2 style="color:#8b5cf6;margin:0 0 16px 0;font-weight:600;">🌅 今早的 Atlas</h2>
  <p style="color:#a1a1aa;margin:0 0 24px 0;">今日 ${due_cards.length} 张待复习${new_cards > 0 ? ` · 昨夜新提炼 ${new_cards} 张` : ""}</p>
  <ul style="list-style:none;padding:0;">${cardList}</ul>
  <a href="${app_url}/app/flashcards/due"
     style="display:inline-block;margin-top:16px;padding:10px 20px;background:#8b5cf6;color:white;border-radius:8px;text-decoration:none;font-weight:500;">
    开始复习 →
  </a>
  <p style="margin-top:32px;color:#52525b;font-size:12px;">Atlas · 你的 AI 学习副驾驶</p>
</div>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
