/**
 * Brave Web Search API client.
 * https://api.search.brave.com/res/v1/web/search
 *
 * Free tier: 2000 queries/month, 1 QPS.
 */

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string; // snippet
  extra_snippets?: string[];
  age?: string;
  page_age?: string;
}

interface BraveApiResponse {
  web?: {
    results?: BraveSearchResult[];
  };
}

interface SearchOptions {
  count?: number; // max results, 1-20
  freshness?: "pd" | "pw" | "pm" | "py"; // past day/week/month/year
  country?: string; // e.g. "us", "cn"
  search_lang?: string; // e.g. "en", "zh-hans"
}

export async function braveSearch(
  apiKey: string,
  query: string,
  options: SearchOptions = {}
): Promise<BraveSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: String(options.count ?? 10),
    extra_snippets: "true",
  });
  if (options.freshness) params.set("freshness", options.freshness);
  if (options.country) params.set("country", options.country);
  if (options.search_lang) params.set("search_lang", options.search_lang);

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      "X-Subscription-Token": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Brave http ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as BraveApiResponse;
  return json.web?.results ?? [];
}

/**
 * Brave free tier is 1 QPS. When running multiple queries in a burst,
 * callers should throttle via this helper.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
