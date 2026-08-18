-- ============================================================
--  Migration: allow "every day" dishes (day_index = 0)
--  Restaurants with a flat catalog (no per-day menu) store all
--  their dishes with day_index = 0, which the app shows on every day.
--  Run this ONCE before seed_restaurants.sql.
-- ============================================================

alter table public.menu_items drop constraint if exists menu_items_day_index_check;
alter table public.menu_items add constraint menu_items_day_index_check
  check (day_index between 0 and 7);

notify pgrst, 'reload schema';
