-- ============================================================
--  Migration: Facebook sign-in
--  Same idea as auth_user_id for Google (see migration_google_auth_link.sql):
--  the Supabase Auth user id of a linked Facebook identity, so once a row is
--  linked every future Facebook login matches it exactly. Kept as its own
--  column so one person can link both Google and Facebook to the same row.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.users add column if not exists facebook_auth_user_id uuid unique;

notify pgrst, 'reload schema';
