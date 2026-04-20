-- 003_cron.sql
-- Supabase pg_cron jobs. Prereq: extension "pg_cron" enabled in the Supabase dashboard.
-- Replace <APP_URL> with your deployed URL before running.
--
-- NOTE: pg_cron uses UTC. We schedule UTC times that roughly map to Asia/Shanghai,
-- then each cron endpoint filters by per-user timezone + morning_ritual_time.
--
-- To apply: set app.settings.app_url & app.settings.cron_secret via Supabase config,
-- or hard-edit the net.http_post calls below.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Distill: every day 19:00 UTC = 03:00 Asia/Shanghai
SELECT cron.schedule(
    'atlas-distill',
    '0 19 * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.app_url') || '/api/cron/distill',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', current_setting('app.settings.cron_secret')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Morning push: every hour, the endpoint filters users whose local time is ~8am
SELECT cron.schedule(
    'atlas-morning-push',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.app_url') || '/api/cron/morning-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', current_setting('app.settings.cron_secret')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Weekly digest: Sunday 00:00 UTC = Sunday 08:00 Asia/Shanghai
SELECT cron.schedule(
    'atlas-weekly-digest',
    '0 0 * * 0',
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.app_url') || '/api/cron/weekly-digest',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', current_setting('app.settings.cron_secret')
        ),
        body := '{}'::jsonb
    );
    $$
);
