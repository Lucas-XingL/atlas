/**
 * Back-fill real, clickable URLs for AI-generated path resources.
 *
 * The path generator returns url=null when unsure to avoid hallucinating a 404.
 * This module fills those nulls:
 *   - physical (books): build a Douban book search URL (no API cost)
 *   - consumable / external: run Brave Search and take the top web result
 *
 * We only back-fill tier='core' resources — they're the critical reading path.
 * Extras can stay with a search_hint.
 *
 * Brave free tier = 1 QPS; queries are serialized with a small sleep.
 * If BRAVE_API_KEY is missing we fall back to Douban for physical only.
 */
import { braveSearch, sleep } from "@/lib/search/brave";
import type { GeneratedResource } from "@/lib/ai/path-generator";

const QPS_DELAY_MS = 1100;

function doubanSearchUrl(title: string): string {
  return `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(title)}`;
}

export async function backfillResourceUrls(
  resources: GeneratedResource[]
): Promise<GeneratedResource[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  const out: GeneratedResource[] = [];
  let braveCalled = false;

  for (const r of resources) {
    if (r.url) {
      out.push(r);
      continue;
    }

    // Physical books → Douban search page (deterministic, no API cost).
    if (r.resource_type === "physical") {
      out.push({ ...r, url: doubanSearchUrl(r.title) });
      continue;
    }

    // Only burn Brave budget on core items; extras stay as null + search_hint.
    if (r.tier !== "core" || !apiKey) {
      out.push(r);
      continue;
    }

    if (braveCalled) await sleep(QPS_DELAY_MS);
    braveCalled = true;

    const query = [r.title, r.author].filter(Boolean).join(" ");
    try {
      const results = await braveSearch(apiKey, query, { count: 3 });
      const best = results[0];
      if (best?.url && /^https?:\/\//.test(best.url)) {
        out.push({ ...r, url: best.url });
        continue;
      }
    } catch (err) {
      console.error("[backfill-urls] brave failed", { query, err });
    }
    out.push(r);
  }
  return out;
}
