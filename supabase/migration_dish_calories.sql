-- ============================================================
--  Migration: rough per-dish calorie estimates
--  Adds a `calories` column to menu_items, filled in by the
--  estimate-calories Edge Function (Gemini). Run this once in the
--  Supabase SQL Editor before deploying that function.
-- ============================================================

alter table public.menu_items
  add column if not exists calories int;

notify pgrst, 'reload schema';
