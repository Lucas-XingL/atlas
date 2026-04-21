-- 004_learning_path.sql — Phase 2 LearningPath + Source consumption + Highlights

-- ---------------------------------------------------------------
-- Knowledge-domain tag on Atlas (drives the genre of a learning path)
-- ---------------------------------------------------------------
ALTER TABLE atlases
  ADD COLUMN IF NOT EXISTS knowledge_domain TEXT
    CHECK (knowledge_domain IN ('tech','finance','art','science','practical','humanities','other'));

-- ---------------------------------------------------------------
-- LearningPath: one active path per atlas, older versions soft-deleted
-- ---------------------------------------------------------------
CREATE TABLE learning_paths (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id         UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version          INT NOT NULL DEFAULT 1,
    overview         TEXT,
    knowledge_domain TEXT CHECK (knowledge_domain IN ('tech','finance','art','science','practical','humanities','other')),
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX learning_paths_one_active_per_atlas
  ON learning_paths (atlas_id) WHERE is_active;
CREATE INDEX ON learning_paths (user_id);

CREATE TABLE path_stages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id      UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    stage_order  INT NOT NULL,
    name         TEXT NOT NULL,
    intent       TEXT,
    est_duration TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON path_stages (path_id, stage_order);

CREATE TABLE path_resources (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id       UUID NOT NULL REFERENCES path_stages(id) ON DELETE CASCADE,
    res_order      INT NOT NULL,
    tier           TEXT NOT NULL DEFAULT 'core' CHECK (tier IN ('core','extra')),
    resource_type  TEXT NOT NULL DEFAULT 'consumable' CHECK (resource_type IN ('consumable','external','physical')),
    title          TEXT NOT NULL,
    url            TEXT,
    author         TEXT,
    why_relevant   TEXT,
    search_hint    TEXT,
    source_id      UUID REFERENCES sources(id) ON DELETE SET NULL,
    user_status    TEXT NOT NULL DEFAULT 'suggested'
                   CHECK (user_status IN ('suggested','accepted','reading','finished','skipped')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON path_resources (stage_id, res_order);
CREATE INDEX ON path_resources (source_id);

-- Updated-at triggers re-using set_updated_at() from 001
CREATE TRIGGER trg_paths_updated BEFORE UPDATE ON learning_paths FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_path_resources_updated BEFORE UPDATE ON path_resources FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- Sources: add resource_type / path_resource_id / reading_progress
-- ---------------------------------------------------------------
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'consumable'
    CHECK (resource_type IN ('consumable','external','physical')),
  ADD COLUMN IF NOT EXISTS path_resource_id UUID REFERENCES path_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reading_progress INT NOT NULL DEFAULT 0
    CHECK (reading_progress BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS sources_path_resource_idx ON sources (path_resource_id);

-- ---------------------------------------------------------------
-- Highlights on source raw_content
-- ---------------------------------------------------------------
CREATE TABLE highlights (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id         UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text              TEXT NOT NULL,
    note              TEXT,
    start_offset      INT NOT NULL,
    end_offset        INT NOT NULL,
    journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON highlights (source_id);
CREATE INDEX ON highlights (user_id, created_at DESC);

-- ---------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------
ALTER TABLE learning_paths  ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_stages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_resources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights      ENABLE ROW LEVEL SECURITY;

CREATE POLICY paths_owner ON learning_paths
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY stages_owner ON path_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM learning_paths p WHERE p.id = path_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM learning_paths p WHERE p.id = path_id AND p.user_id = auth.uid()));

CREATE POLICY resources_owner ON path_resources FOR ALL
  USING (EXISTS (SELECT 1 FROM path_stages s JOIN learning_paths p ON p.id = s.path_id
                 WHERE s.id = stage_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM path_stages s JOIN learning_paths p ON p.id = s.path_id
                      WHERE s.id = stage_id AND p.user_id = auth.uid()));

CREATE POLICY highlights_owner ON highlights
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
