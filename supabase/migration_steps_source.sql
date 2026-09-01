-- ============================================================
--  Migration: daily_steps.source (manual vs. device-synced)
--  Distinguishes a hand-typed entry from one pulled automatically
--  from the phone's Health Connect data, so an automatic sync can
--  never silently clobber something the user typed in themselves.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.daily_steps
  add column if not exists source text not null default 'manual';

alter table public.daily_steps
  drop constraint if exists daily_steps_source_check;
alter table public.daily_steps
  add constraint daily_steps_source_check check (source in ('manual', 'device'));

notify pgrst, 'reload schema';
