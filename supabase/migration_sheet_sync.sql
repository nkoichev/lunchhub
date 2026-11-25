-- ============================================================
--  Migration: automatic Google Sheet → orders sync
--  pg_cron calls the sync-sheet-orders Edge Function every 20 min on
--  weekdays. The cron range (07:00–12:40 UTC) covers 10:00–14:00 Sofia in
--  both winter and summer time; the function itself enforces the exact
--  window (SYNC_FROM/SYNC_TO) and skips runs where the sheet is unchanged.
--  Replace <CRON_SECRET> with the value of the CRON_SECRET function secret.
-- ============================================================

create table if not exists public.sheet_sync_state (
  id          text primary key,
  last_hash   text,
  last_run_at timestamptz,
  last_result jsonb
);
-- Service role only — no policies on purpose.
alter table public.sheet_sync_state enable row level security;

select cron.unschedule('lunchhub-sync-sheet-orders')
where exists (select 1 from cron.job where jobname = 'lunchhub-sync-sheet-orders');

select cron.schedule(
  'lunchhub-sync-sheet-orders',
  '*/20 7-12 * * 1-5',
  $$
  select net.http_post(
    url := 'https://pdywobzszjcqfwkxzjsg.supabase.co/functions/v1/sync-sheet-orders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
