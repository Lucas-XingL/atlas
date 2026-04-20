-- 002_rls.sql
-- Row-level security: every table scoped to auth.uid().

ALTER TABLE atlases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources           ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings     ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlases_owner ON atlases
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY sources_owner ON sources
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY journal_owner ON journal_entries
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY flashcards_owner ON flashcards
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY digest_owner ON digest_snapshots
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_settings_owner ON user_settings
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
