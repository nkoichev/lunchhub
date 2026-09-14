-- ============================================================
--  Migration: link Google sign-in by stable auth identity
--  Google sign-in used to match an existing users row by name only —
--  fragile the moment the Google profile's name doesn't spell the same
--  as what someone typed at name-only login (different script, nickname,
--  first vs. full name). auth_user_id is the Supabase Auth user id for
--  that Google identity: it never changes, so once a row is linked, every
--  future login from that same Google account matches instantly and
--  exactly, no name-guessing involved.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.users add column if not exists auth_user_id uuid unique;

notify pgrst, 'reload schema';
