-- ============================================================
--  Migration: close public access to rls_auto_enable()
--  This function wasn't created by our schema (looks like a
--  Supabase-platform-generated helper). It's SECURITY DEFINER and was
--  publicly callable via /rest/v1/rpc/rls_auto_enable — nothing in
--  this app calls it, so revoke public execute rather than leave a
--  privilege-escalation surface exposed for no reason.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

revoke execute on function public.rls_auto_enable() from anon, authenticated;

notify pgrst, 'reload schema';
