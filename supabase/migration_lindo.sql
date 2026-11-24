-- ============================================================
--  Migration: "Lindo" restaurant + its morning menu import
--  The menu is scraped from https://lindo.bg/menu/daily by the
--  import-lindo-menu Edge Function:
--    - weekly specials ("Седмично обедно") → day_index 1..5
--    - everyday lunch menu ("Всекидневно обедно") → day_index 0
--  Lindo publishes the specials day by day, so pg_cron calls the
--  function every 30 min on weekday mornings (05:00–09:30 UTC =
--  07:00–11:30 Sofia in winter, 08:00–12:30 in summer). Re-runs are
--  cheap no-ops when nothing changed.
--  Needs pg_cron + pg_net (both enabled on this project).
--  Uses the publishable (anon) key, same one the app bundle ships with.
-- ============================================================

insert into public.restaurants (id, name) values
  ('lindo', 'Lindo')
on conflict (id) do update set name = excluded.name;

select cron.unschedule('lunchhub-import-lindo-menu')
where exists (select 1 from cron.job where jobname = 'lunchhub-import-lindo-menu');

select cron.schedule(
  'lunchhub-import-lindo-menu',
  '0,30 5-9 * * 1-5',
  $$
  select net.http_post(
    url := 'https://pdywobzszjcqfwkxzjsg.supabase.co/functions/v1/import-lindo-menu',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_PUBLISHABLE_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

notify pgrst, 'reload schema';
