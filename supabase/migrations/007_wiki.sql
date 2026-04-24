-- 007_wiki.sql — Knowledge wiki layer (Karpathy LLM-wiki pattern)
--
-- After a source is marked read, the LLM ingests (source + its highlights +
-- its linked journal entries) into a per-atlas wiki. The wiki is the third
-- layer on top of raw sources — LLM-maintained markdown pages that compound
-- over time. Users read it; the LLM writes it.
--
-- Page kinds:
--   'source'    one per ingested source; reading-notes style
--   'concept'   entity / concept extracted across sources
--   'index'     catalog of pages in the wiki (one per atlas, slug='index')
--   'log'       append-only ingest/lint log (one per atlas, slug='log')
--   'synthesis' optional atlas-level overview (one per atlas, slug='overview')

CREATE TABLE wiki_pages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id      UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- URL-safe slug, unique within an atlas. Concept pages use kebab-case
    -- titles; source pages use 'source-<short_id>'; index/log/overview are reserved.
    slug          TEXT NOT NULL,
    title         TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('source','concept','index','log','synthesis')),
    body_md       TEXT NOT NULL DEFAULT '',
    -- Arbitrary metadata: {source_id, tags, aliases, confidence, ingested_source_ids, ...}
    frontmatter   JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Version number (bumped every meaningful LLM rewrite). Useful for the UI
    -- to show "updated" badges and for lint to compare drift.
    revision      INT NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (atlas_id, slug)
);
CREATE INDEX wiki_pages_atlas_kind_idx ON wiki_pages (atlas_id, kind);
CREATE INDEX wiki_pages_user_idx ON wiki_pages (user_id);

-- Denormalized link graph. Parsed from body_md whenever a page is written.
-- Keeps the graph view query cheap (no markdown parsing in the hot path).
CREATE TABLE wiki_links (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id   UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    from_page  UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    -- The [[target-slug]] the author wrote. May not yet resolve to a real page
    -- (LLM sometimes links ahead of itself). `to_page` is set once resolvable.
    to_slug    TEXT NOT NULL,
    to_page    UUID REFERENCES wiki_pages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_page, to_slug)
);
CREATE INDEX wiki_links_atlas_idx ON wiki_links (atlas_id);
CREATE INDEX wiki_links_to_page_idx ON wiki_links (to_page);

-- Chronological ingest / lint log. One row per operation, keyed to the atlas.
-- Powers the `log` page and the "recent activity" panel.
CREATE TABLE wiki_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id     UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('ingest','lint','manual')),
    source_id    UUID REFERENCES sources(id) ON DELETE SET NULL,
    summary      TEXT NOT NULL,                         -- one-line human summary
    pages_touched JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{slug,title,action}]
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wiki_log_atlas_created_idx ON wiki_log (atlas_id, created_at DESC);

-- sources: whether this source has been ingested into the wiki (nullable timestamp)
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS wiki_ingested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wiki_page_id UUID REFERENCES wiki_pages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sources_wiki_ingested_idx ON sources (atlas_id, wiki_ingested_at);

-- Updated-at trigger
CREATE TRIGGER trg_wiki_pages_updated BEFORE UPDATE ON wiki_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_log   ENABLE ROW LEVEL SECURITY;

CREATE POLICY wiki_pages_owner ON wiki_pages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- wiki_links has no user_id; delegate ownership to the atlas.
CREATE POLICY wiki_links_owner ON wiki_links FOR ALL
  USING (EXISTS (SELECT 1 FROM atlases a WHERE a.id = atlas_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM atlases a WHERE a.id = atlas_id AND a.user_id = auth.uid()));

CREATE POLICY wiki_log_owner ON wiki_log
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
