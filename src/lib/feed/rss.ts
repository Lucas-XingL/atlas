import { XMLParser } from "fast-xml-parser";

export interface ParsedFeed {
  title: string;
  site_url: string | null;
  items: ParsedItem[];
}

export interface ParsedItem {
  external_id: string;
  title: string;
  url: string | null;
  author: string | null;
  published_at: string | null;
  summary_preview: string | null;
}

const USER_AGENT = "Atlas/1.0 (+https://atlas-dun-eight.vercel.app)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Some feeds use CDATA; library collapses by default which is fine.
});

export async function fetchAndParseFeed(feedUrl: string): Promise<ParsedFeed> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml" },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`feed http ${res.status}`);
  const xml = await res.text();

  const doc = parser.parse(xml);

  // RSS 2.0
  if (doc.rss?.channel) {
    const channel = doc.rss.channel;
    const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
    return {
      title: stringOf(channel.title) || feedUrl,
      site_url: stringOf(channel.link) || null,
      items: rawItems.map(parseRssItem).filter(Boolean) as ParsedItem[],
    };
  }

  // Atom
  if (doc.feed) {
    const feed = doc.feed;
    const rawItems = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
    return {
      title: stringOf(feed.title) || feedUrl,
      site_url: findAtomSelfLink(feed) ?? null,
      items: rawItems.map(parseAtomEntry).filter(Boolean) as ParsedItem[],
    };
  }

  throw new Error("Unrecognized feed format (not RSS 2.0 or Atom)");
}

function stringOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    // e.g. { "#text": "..." } or array
    const obj = v as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"];
  }
  return "";
}

function findAtomSelfLink(feed: any): string | null {
  const links = Array.isArray(feed.link) ? feed.link : feed.link ? [feed.link] : [];
  for (const l of links) {
    if (l && typeof l === "object") {
      const rel = l["@_rel"];
      const href = l["@_href"];
      if (!rel || rel === "alternate") return href ?? null;
    } else if (typeof l === "string") {
      return l;
    }
  }
  return null;
}

function parseRssItem(raw: any): ParsedItem | null {
  const title = stringOf(raw.title);
  const link = stringOf(raw.link);
  if (!title && !link) return null;
  const guid = raw.guid ? stringOf(raw.guid) || (typeof raw.guid === "object" ? raw.guid["#text"] : "") : "";
  return {
    external_id: String(guid || link || title).slice(0, 500),
    title: title.slice(0, 300) || "(untitled)",
    url: link || null,
    author: stringOf(raw["dc:creator"]) || stringOf(raw.author) || null,
    published_at: toISO(raw.pubDate),
    summary_preview: stripToText(stringOf(raw.description) || stringOf(raw["content:encoded"])).slice(0, 400) || null,
  };
}

function parseAtomEntry(raw: any): ParsedItem | null {
  const title = stringOf(raw.title);
  const link = Array.isArray(raw.link) ? raw.link : raw.link ? [raw.link] : [];
  const href = findAtomAlternateLink(link);
  const id = stringOf(raw.id);
  if (!title && !href) return null;
  return {
    external_id: (id || href || title).slice(0, 500),
    title: title.slice(0, 300) || "(untitled)",
    url: href,
    author: stringOf(raw.author?.name) || null,
    published_at: toISO(raw.published || raw.updated),
    summary_preview: stripToText(stringOf(raw.summary) || stringOf(raw.content)).slice(0, 400) || null,
  };
}

function findAtomAlternateLink(links: any[]): string | null {
  for (const l of links) {
    if (l && typeof l === "object") {
      const rel = l["@_rel"];
      if (!rel || rel === "alternate") {
        return l["@_href"] || null;
      }
    }
  }
  return null;
}

function toISO(s: unknown): string | null {
  if (!s) return null;
  const v = String(s);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function stripToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
