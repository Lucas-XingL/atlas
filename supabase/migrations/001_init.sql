-- 001_init.sql
-- Atlas MVP schema. User is managed by Supabase Auth (auth.users).

-- ------------------------------------------------------------
-- Atlases: one per topic
-- ------------------------------------------------------------
CREATE TABLE atlases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    thesis      TEXT,
    tags        TEXT[] NOT NULL DEFAULT '{}',
    scope_in    TEXT[] NOT NULL DEFAULT '{}',
    scope_out   TEXT[] NOT NULL DEFAULT '{}',
    framework   JSONB NOT NULL DEFAULT '{}'::jsonb,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, slug)
);
CREATE INDEX atlases_user_idx ON atlases (user_id);

-- ------------------------------------------------------------
-- Sources: articles / text / etc that fuel the atlas
-- ------------------------------------------------------------
CREATE TABLE sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url             TEXT,
    title           TEXT NOT NULL,
    author          TEXT,
    pub_date        DATE,
    source_type     TEXT NOT NULL CHECK (source_type IN ('web', 'text', 'pdf', 'video', 'arxiv')),
    raw_content     TEXT,
    summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'reading', 'read', 'dismissed')),
    ai_recommended  BOOLEAN NOT NULL DEFAULT false,
    fetch_status    TEXT NOT NULL DEFAULT 'pending' CHECK (fetch_status IN ('pending', 'fetching', 'summarizing', 'ready', 'failed')),
    fetch_error     TEXT,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sources_atlas_idx ON sources (atlas_id);
CREATE INDEX sources_atlas_status_idx ON sources (atlas_id, status);

-- ------------------------------------------------------------
-- Journal entries: raw thoughts
-- ------------------------------------------------------------
CREATE TABLE journal_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID REFERENCES atlases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    channel         TEXT NOT NULL CHECK (channel IN ('web', 'voice', 'highlight')),
    source_ref      UUID REFERENCES sources(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'distilled', 'archived')),
    ai_annotations  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ
);
CREATE INDEX journal_atlas_created_idx ON journal_entries (atlas_id, created_at DESC);
CREATE INDEX journal_user_status_idx ON journal_entries (user_id, status);

-- ------------------------------------------------------------
-- Flashcards: distilled from journal entries
-- ------------------------------------------------------------
CREATE TABLE flashcards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    front           TEXT NOT NULL,
    back            TEXT NOT NULL,
    origin_type     TEXT CHECK (origin_type IN ('journal', 'highlight', 'manual')),
    origin_refs     UUID[] NOT NULL DEFAULT '{}',
    -- SM-2 state
    ease            REAL NOT NULL DEFAULT 2.5,
    interval_days   INTEGER NOT NULL DEFAULT 0,
    stage           TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'learning', 'review', 'mastered')),
    next_review_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    review_count    INTEGER NOT NULL DEFAULT 0,
    success_count   INTEGER NOT NULL DEFAULT 0,
    maturity        INTEGER NOT NULL DEFAULT 0,
    last_rating     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX flashcards_due_idx ON flashcards (user_id, next_review_at);
CREATE INDEX flashcards_atlas_idx ON flashcards (atlas_id);

-- ------------------------------------------------------------
-- Digest snapshots: weekly summaries
-- ------------------------------------------------------------
CREATE TABLE digest_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period          TEXT NOT NULL CHECK (period IN ('daily', 'weekly')),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    content         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX digest_atlas_idx ON digest_snapshots (atlas_id, period_end DESC);

-- ------------------------------------------------------------
-- User settings
-- ------------------------------------------------------------
CREATE TABLE user_settings (
    user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    timezone               TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    default_atlas_id       UUID REFERENCES atlases(id) ON DELETE SET NULL,
    morning_ritual_time    TIME NOT NULL DEFAULT '08:00:00',
    llm_provider           TEXT NOT NULL DEFAULT 'zhipu' CHECK (llm_provider IN ('zhipu', 'minimax')),
    llm_model_quality      TEXT,                        -- e.g. glm-5.1 or MiniMax-M2.7
    llm_model_fast         TEXT,                        -- e.g. glm-4.7-flashx or MiniMax-M2.7-highspeed
    llm_api_key            TEXT,                        -- user's own key (plain; consider pgsodium in prod)
    minimax_group_id       TEXT,
    email_push_enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Updated-at trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atlases_updated BEFORE UPDATE ON atlases FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sources_updated BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_flashcards_updated BEFORE UPDATE ON flashcards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_settings_updated BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- Bootstrap user_settings on auth.users insert
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION bootstrap_user_settings() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_bootstrap_user_settings
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION bootstrap_user_settings();
