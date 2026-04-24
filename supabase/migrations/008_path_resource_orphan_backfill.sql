-- 008_path_resource_orphan_backfill.sql
--
-- One-off cleanup: path_resources whose linked source was deleted used to
-- get stranded with user_status='reading' or 'accepted' but source_id=null.
-- The deletion path now writes them back to 'suggested', but historical
-- rows need a catch-up pass. Safe to re-run; the update is idempotent.

UPDATE path_resources
   SET user_status = 'suggested'
 WHERE source_id IS NULL
   AND user_status IN ('reading', 'accepted');
