-- ============================================================
--  Migration: seed "Щастливеца" restaurant
--  Its menu changes every workday (imported daily from an email by the
--  import-daily-menu Edge Function), so day_index rows here are just
--  placeholders that get overwritten each morning.
-- ============================================================

insert into public.restaurants (id, name) values
  ('shtastlivetsa', 'Щастливеца')
on conflict (id) do update set name = excluded.name;

notify pgrst, 'reload schema';
