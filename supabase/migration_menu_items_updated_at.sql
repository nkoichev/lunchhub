-- ============================================================
--  Migration: track when a menu was actually imported
--  menu_items had no timestamp at all, so there was no way to tell —
--  from the DB, or in the app — whether a given day's menu was imported
--  this morning or is stale leftover from a previous week (which is
--  exactly what happened: the Щастливеца daily Gmail→Gemini import
--  silently failed and nobody could tell without manually comparing
--  dishes against the actual emailed menu). default now() is enough:
--  both the automated import and any manual fix always delete + insert
--  a day's rows rather than updating them in place, so INSERT time is
--  always the true "last imported" time.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.menu_items add column if not exists updated_at timestamptz not null default now();

notify pgrst, 'reload schema';
