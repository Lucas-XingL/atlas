import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLlmConfig } from "@/lib/ai/resolve-config";
import {
  extractWikilinks,
  ingestSourceToWiki,
  type WikiPageOp,
} from "@/lib/ai/ingest-wiki";
import type {
  Atlas,
  Highlight,
  JournalEntry,
  Source,
  WikiPage,
} from "@/lib/types";

/**
 * Ingest one source into its atlas's wiki:
 *   1. gather (source, highlights, linked journal entries, wiki state)
 *   2. ask the LLM for page ops (≤5)
 *   3. upsert source + concept pages
 *   4. rebuild wiki_links for every touched page
 *   5. refresh index.md + append to log.md + write wiki_log row
 *   6. mark source.wiki_ingested_at + wiki_page_id
 *
 * Idempotent: re-running will update the source page and (possibly) revise
 * concept pages. Safe to call from auto-trigger or a manual button.
 */
export async function ingestSourceIntoWiki(
  supabase: SupabaseClient,
  sourceId: string,
  userId: string
): Promise<{ ok: true; source_page_slug: string } | { ok: false; error: string }> {
  // --- 1. Gather inputs ---
  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .select("id, atlas_id, user_id, title, url, author, summary, raw_content")
    .eq("id", sourceId)
    .maybeSingle<
      Pick<
        Source,
        "id" | "atlas_id" | "user_id" | "title" | "url" | "author" | "summary" | "raw_content"
      >
    >();

  if (srcErr || !source) return { ok: false, error: srcErr?.message ?? "source not found" };

  const { data: atlas } = await supabase
    .from("atlases")
    .select("id, name, thesis")
    .eq("id", source.atlas_id)
    .maybeSingle<Pick<Atlas, "id" | "name" | "thesis">>();
  if (!atlas) return { ok: false, error: "atlas not found" };

  const { data: highlights } = await supabase
    .from("highlights")
    .select("id, text, note, journal_entry_id")
    .eq("source_id", source.id)
    .order("start_offset");

  const journalIds = (highlights ?? [])
    .map((h) => h.journal_entry_id)
    .filter((x): x is string => !!x);

  const journalById = new Map<string, string>();
  if (journalIds.length > 0) {
    const { data: entries } = await supabase
      .from("journal_entries")
      .select("id, text")
      .in("id", journalIds);
    for (const j of (entries ?? []) as Pick<JournalEntry, "id" | "text">[]) {
      journalById.set(j.id, j.text);
    }
  }

  const highlightInputs = (highlights ?? []).map(
    (h: Pick<Highlight, "id" | "text" | "note" | "journal_entry_id">) => ({
      id: h.id,
      text: h.text,
      note: h.note,
      user_journal: h.journal_entry_id ? journalById.get(h.journal_entry_id) ?? null : null,
    })
  );

  const { data: existingPages } = await supabase
    .from("wiki_pages")
    .select("id, slug, title, kind, body_md, updated_at")
    .eq("atlas_id", source.atlas_id)
    .order("updated_at", { ascending: false });

  const allExisting = (existingPages ?? []) as Array<
    Pick<WikiPage, "id" | "slug" | "title" | "kind" | "body_md" | "updated_at">
  >;

  const existingCatalog = allExisting
    .filter((p) => p.kind === "source" || p.kind === "concept")
    .map((p) => ({ slug: p.slug, title: p.title, kind: p.kind }));

  const hotConcepts = allExisting
    .filter((p) => p.kind === "concept")
    .slice(0, 3)
    .map((p) => ({ slug: p.slug, title: p.title, body_md: p.body_md }));

  const sourceSlug = `source-${source.id.slice(0, 8)}`;

  // --- 2. LLM ops ---
  const llm = await resolveLlmConfig(supabase, userId);
  let result;
  try {
    result = await ingestSourceToWiki(
      llm,
      {
        atlas,
        source,
        highlights: highlightInputs,
        existing_pages: existingCatalog,
        hot_concepts: hotConcepts,
      },
      { source_slug: sourceSlug }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: `llm ingest failed: ${message}` };
  }

  // --- 3. Upsert pages ---
  const existingBySlug = new Map(allExisting.map((p) => [p.slug, p]));
  const touched: Array<{ slug: string; title: string; action: "created" | "updated" | "unchanged" }> =
    [];
  const pageIdBySlug = new Map<string, string>(allExisting.map((p) => [p.slug, p.id]));

  const opsToApply: WikiPageOp[] = [result.source_page, ...result.concept_ops];

  for (const op of opsToApply) {
    const existing = existingBySlug.get(op.slug);

    if (existing) {
      // Preserve existing frontmatter; merge new tags/aliases in.
      const prevFm = ((allExisting.find((p) => p.id === existing.id) as WikiPage | undefined)
        ?.frontmatter ?? {}) as Record<string, unknown>;
      const nextFm = mergeFrontmatter(prevFm, op, source.id);

      const { error: updErr } = await supabase
        .from("wiki_pages")
        .update({
          title: op.title,
          body_md: op.body_md,
          frontmatter: nextFm,
          revision: ((existing as WikiPage).revision ?? 1) + 1,
        })
        .eq("id", existing.id);
      if (updErr) return { ok: false, error: `update ${op.slug}: ${updErr.message}` };

      touched.push({ slug: op.slug, title: op.title, action: "updated" });
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("wiki_pages")
        .insert({
          atlas_id: source.atlas_id,
          user_id: userId,
          slug: op.slug,
          title: op.title,
          kind: op.kind,
          body_md: op.body_md,
          frontmatter: mergeFrontmatter({}, op, source.id),
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        return { ok: false, error: `insert ${op.slug}: ${insErr?.message}` };
      }
      pageIdBySlug.set(op.slug, inserted.id);
      touched.push({ slug: op.slug, title: op.title, action: "created" });
    }
  }

  // --- 4. Rebuild wiki_links for touched pages ---
  for (const op of opsToApply) {
    const fromId = pageIdBySlug.get(op.slug);
    if (!fromId) continue;
    await supabase.from("wiki_links").delete().eq("from_page", fromId);

    const slugs = extractWikilinks(op.body_md);
    if (slugs.length === 0) continue;
    const rows = slugs.map((to_slug) => ({
      atlas_id: source.atlas_id,
      from_page: fromId,
      to_slug,
      to_page: pageIdBySlug.get(to_slug) ?? null,
    }));
    await supabase.from("wiki_links").insert(rows);
  }

  // Resolve any previously-dangling links that now point to newly-created pages.
  for (const op of opsToApply) {
    const pageId = pageIdBySlug.get(op.slug);
    if (!pageId) continue;
    await supabase
      .from("wiki_links")
      .update({ to_page: pageId })
      .eq("atlas_id", source.atlas_id)
      .eq("to_slug", op.slug)
      .is("to_page", null);
  }

  // --- 5. Log row + index/log page refresh ---
  await supabase.from("wiki_log").insert({
    atlas_id: source.atlas_id,
    user_id: userId,
    kind: "ingest",
    source_id: source.id,
    summary: result.log_summary,
    pages_touched: touched,
  });

  await refreshIndexPage(supabase, source.atlas_id, userId);
  await refreshLogPage(supabase, source.atlas_id, userId);

  // --- 6. Mark source as ingested ---
  const sourcePageId = pageIdBySlug.get(sourceSlug) ?? null;
  await supabase
    .from("sources")
    .update({
      wiki_ingested_at: new Date().toISOString(),
      wiki_page_id: sourcePageId,
    })
    .eq("id", source.id);

  return { ok: true, source_page_slug: sourceSlug };
}

function mergeFrontmatter(
  prev: Record<string, unknown>,
  op: WikiPageOp,
  sourceId: string
): Record<string, unknown> {
  const prevSources = Array.isArray(prev.source_ids) ? (prev.source_ids as string[]) : [];
  const prevTags = Array.isArray(prev.tags) ? (prev.tags as string[]) : [];
  const prevAliases = Array.isArray(prev.aliases) ? (prev.aliases as string[]) : [];

  const nextSources =
    op.kind === "source"
      ? [sourceId] // source page has exactly one
      : Array.from(new Set([...prevSources, sourceId]));

  return {
    ...prev,
    source_ids: nextSources,
    tags: dedupe([...prevTags, ...(op.tags ?? [])]).slice(0, 12),
    aliases: dedupe([...prevAliases, ...(op.aliases ?? [])]).slice(0, 8),
  };
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

/**
 * Rebuild the per-atlas index page. Not an LLM call — deterministic listing.
 * Groups by kind and sorts alphabetically.
 */
async function refreshIndexPage(
  supabase: SupabaseClient,
  atlasId: string,
  userId: string
): Promise<void> {
  const { data: pages } = await supabase
    .from("wiki_pages")
    .select("slug, title, kind, updated_at, frontmatter")
    .eq("atlas_id", atlasId)
    .in("kind", ["source", "concept", "synthesis"])
    .order("title");

  const rows = (pages ?? []) as Array<
    Pick<WikiPage, "slug" | "title" | "kind" | "updated_at" | "frontmatter">
  >;

  const byKind = {
    concept: rows.filter((p) => p.kind === "concept"),
    source: rows.filter((p) => p.kind === "source"),
    synthesis: rows.filter((p) => p.kind === "synthesis"),
  };

  const line = (p: (typeof rows)[number]) => {
    const tags = Array.isArray(p.frontmatter?.tags) ? (p.frontmatter!.tags as string[]) : [];
    const tagSuffix = tags.length ? ` · ${tags.slice(0, 3).join(" / ")}` : "";
    return `- [[${p.slug}]] ${p.title}${tagSuffix}`;
  };

  const body_md = [
    `# 知识库目录`,
    "",
    `共 ${rows.length} 页 · 最近更新 ${new Date().toISOString().slice(0, 10)}`,
    "",
    byKind.synthesis.length ? "## 🧭 综述" : null,
    ...(byKind.synthesis.length ? byKind.synthesis.map(line) : []),
    byKind.synthesis.length ? "" : null,
    "## 💡 概念",
    byKind.concept.length ? byKind.concept.map(line).join("\n") : "_暂无_",
    "",
    "## 📚 Source 读书笔记",
    byKind.source.length ? byKind.source.map(line).join("\n") : "_暂无_",
  ]
    .filter((x): x is string => x !== null)
    .join("\n");

  await upsertReservedPage(supabase, atlasId, userId, "index", "index", "知识库目录", body_md);
}

/**
 * Refresh the log page from the last 30 entries of wiki_log.
 */
async function refreshLogPage(
  supabase: SupabaseClient,
  atlasId: string,
  userId: string
): Promise<void> {
  const { data: logs } = await supabase
    .from("wiki_log")
    .select("kind, summary, pages_touched, created_at")
    .eq("atlas_id", atlasId)
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (logs ?? []) as Array<{
    kind: string;
    summary: string;
    pages_touched: Array<{ slug: string; title: string; action: string }>;
    created_at: string;
  }>;

  const body_md = [
    "# 操作日志",
    "",
    "最近 30 次 ingest / lint 记录。",
    "",
    ...rows.map((r) => {
      const date = r.created_at.slice(0, 10);
      const touched = r.pages_touched
        .map((t) => `  - ${t.action}: [[${t.slug}]] ${t.title}`)
        .join("\n");
      return `## [${date}] ${r.kind} | ${r.summary}\n${touched || "  _(no page changes)_"}`;
    }),
  ].join("\n");

  await upsertReservedPage(supabase, atlasId, userId, "log", "log", "操作日志", body_md);
}

async function upsertReservedPage(
  supabase: SupabaseClient,
  atlasId: string,
  userId: string,
  slug: string,
  kind: "index" | "log" | "synthesis",
  title: string,
  body_md: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("wiki_pages")
    .select("id, revision")
    .eq("atlas_id", atlasId)
    .eq("slug", slug)
    .maybeSingle<{ id: string; revision: number }>();

  if (existing) {
    await supabase
      .from("wiki_pages")
      .update({ title, body_md, revision: existing.revision + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("wiki_pages").insert({
      atlas_id: atlasId,
      user_id: userId,
      slug,
      title,
      kind,
      body_md,
    });
  }
}
