-- ============================================================
--  Migration: Google avatar support
--  Lets a user optionally sign in with Google instead of just typing a
--  name; when they do, their Google profile photo is stored here and
--  shown across the app (header, rankings, steps).
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.users add column if not exists avatar_url text;

notify pgrst, 'reload schema';
