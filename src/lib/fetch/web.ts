import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export interface FetchedArticle {
  title: string;
  byline: string | null;
  markdown: string;
  text_length: number;
  pub_date: string | null;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.remove(["script", "style", "nav", "footer", "iframe"]);

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Atlas/1.0";

export async function fetchWebArticle(url: string): Promise<FetchedArticle> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const html = await res.text();

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  if (!parsed || !parsed.content) {
    // Fallback: strip tags and keep body text
    const textFallback = dom.window.document.body?.textContent?.trim() ?? "";
    return {
      title: dom.window.document.title || url,
      byline: null,
      markdown: textFallback.slice(0, 50_000),
      text_length: textFallback.length,
      pub_date: null,
    };
  }

  const markdown = turndown.turndown(parsed.content);

  return {
    title: parsed.title || dom.window.document.title || url,
    byline: parsed.byline ?? null,
    markdown,
    text_length: parsed.textContent?.length ?? markdown.length,
    pub_date: extractPubDate(dom.window.document),
  };
}

function extractPubDate(doc: Document): string | null {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publish_date"]',
    'meta[itemprop="datePublished"]',
    "time[datetime]",
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const raw = el?.getAttribute("content") ?? el?.getAttribute("datetime");
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

export function detectSourceType(url: string): "web" | "arxiv" | "pdf" | "video" {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes("arxiv.org")) return "arxiv";
    if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "video";
    if (u.pathname.toLowerCase().endsWith(".pdf")) return "pdf";
    return "web";
  } catch {
    return "web";
  }
}
