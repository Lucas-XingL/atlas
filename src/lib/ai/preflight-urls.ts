/**
 * URL preflight for AI-generated path resources.
 *
 * LLMs occasionally hallucinate URLs that 404, or back-fill picks a homepage
 * instead of an article. Before persisting path_resources we run a lightweight
 * HEAD request (falling back to GET for sites that reject HEAD) to weed out
 * broken links. Failed `consumable` resources are demoted to `external` so the
 * UI shows a "需外部看" affordance instead of a "开始读" that immediately fails.
 *
 * Budget:
 *   - only checks resources with a URL (nothing to validate otherwise)
 *   - 3s per request, capped concurrency so we don't hang the path/generate
 *     request on one slow host
 *   - failures log but never throw
 */
import type { GeneratedResource } from "@/lib/ai/path-generator";

const TIMEOUT_MS = 3000;
const CONCURRENCY = 6;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Atlas/1.0";

async function checkUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return true;
    // Some CDNs / gov sites refuse HEAD but accept GET (405 / 403 on HEAD).
    if (res.status === 405 || res.status === 403) {
      const res2 = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res2.ok;
    }
    return false;
  } catch {
    return false;
  }
}

export async function preflightResourceUrls(
  resources: GeneratedResource[]
): Promise<GeneratedResource[]> {
  // Kick off HEAD checks with bounded concurrency.
  const indexes = resources
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => typeof r.url === "string" && r.url.length > 0);

  const results: Array<{ i: number; ok: boolean }> = [];
  for (let start = 0; start < indexes.length; start += CONCURRENCY) {
    const batch = indexes.slice(start, start + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async ({ r, i }) => ({ i, ok: await checkUrl(r.url!) }))
    );
    results.push(...settled);
  }

  const failedSet = new Set(results.filter((x) => !x.ok).map((x) => x.i));
  if (failedSet.size === 0) return resources;

  return resources.map((r, i) => {
    if (!failedSet.has(i)) return r;
    // Drop the dead URL. For consumable, demote to external so UX doesn't
    // promise an online reader we can't deliver.
    const nextType = r.resource_type === "consumable" ? "external" : r.resource_type;
    const hint =
      r.search_hint ??
      [r.title, r.author].filter(Boolean).join(" · ");
    console.warn("[preflight] url dead, degrading", { url: r.url, title: r.title });
    return {
      ...r,
      url: null,
      resource_type: nextType,
      search_hint: hint,
    };
  });
}
