-- 005_source_pipelines.sql — v3: three source pipelines + unified reading pool

-- ---------------------------------------------------------------
-- sources: origin + origin_ref (polymorphic ref to path_resource / subscription_item / null)
-- ---------------------------------------------------------------
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('path','subscription','manual')),
  ADD COLUMN IF NOT EXISTS origin_ref UUID;

-- Backfill: rows with path_resource_id are obviously from path pipeline
UPDATE sources
   SET origin = 'path',
       origin_ref = path_resource_id
 WHERE path_resource_id IS NOT NULL
   AND origin = 'manual';

CREATE INDEX IF NOT EXISTS sources_origin_idx ON sources (origin);

-- ---------------------------------------------------------------
-- Subscriptions (RSS feeds)
-- ---------------------------------------------------------------
CREATE TABLE subscriptions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id         UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feed_url         TEXT NOT NULL,
    title            TEXT NOT NULL,
    site_url         TEXT,
    fetch_schedule   TEXT NOT NULL DEFAULT 'daily' CHECK (fetch_schedule IN ('hourly','daily')),
    is_active        BOOLEAN NOT NULL DEFAULT true,
    last_fetched_at  TIMESTAMPTZ,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (atlas_id, feed_url)
);
CREATE INDEX ON subscriptions (user_id);
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE subscription_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id       TEXT NOT NULL,
    title             TEXT NOT NULL,
    url               TEXT,
    author            TEXT,
    published_at      TIMESTAMPTZ,
    summary_preview   TEXT,
    user_status       TEXT NOT NULL DEFAULT 'new'
                      CHECK (user_status IN ('new','in_pool','skipped')),
    source_id         UUID REFERENCES sources(id) ON DELETE SET NULL,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subscription_id, external_id)
);
CREATE INDEX ON subscription_items (user_id, user_status);
CREATE INDEX ON subscription_items (subscription_id, fetched_at DESC);

-- ---------------------------------------------------------------
-- Manual candidates (catch-all pasted drafts waiting to be pooled)
-- ---------------------------------------------------------------
CREATE TABLE manual_candidates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id      UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url           TEXT,
    text_snippet  TEXT,
    title         TEXT NOT NULL,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON manual_candidates (atlas_id, created_at DESC);
CREATE INDEX ON manual_candidates (user_id);

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_candidates   ENABLE ROW LEVEL SECURITY;

CREATE POLICY subs_owner ON subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY sub_items_owner ON subscription_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY manual_cand_owner ON manual_candidates
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
