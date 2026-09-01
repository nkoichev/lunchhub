-- ============================================================
--  Migration: daily step counts + colleague comparison
--  Adds a `daily_steps` table — one row per person per calendar
--  day — that powers the new "Стъпки" tab (personal trend +
--  leaderboard + head-to-head comparison charts).
--  Run this once in the Supabase SQL Editor.
-- ============================================================

-- One entry per user per day. Re-logging the same day overwrites
-- (upsert on the unique pair) rather than stacking duplicate rows.
create table if not exists public.daily_steps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  step_date  date not null default current_date,
  steps      int  not null default 0 check (steps >= 0 and steps <= 300000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, step_date)
);
create index if not exists daily_steps_date_idx on public.daily_steps(step_date);
create index if not exists daily_steps_user_idx on public.daily_steps(user_id);

-- ---------- Row Level Security ----------
-- Same posture as the rest of the app: small trusted team on the
-- anon key, full access allowed.
alter table public.daily_steps enable row level security;
drop policy if exists "anon_all_daily_steps" on public.daily_steps;
create policy "anon_all_daily_steps" on public.daily_steps
  for all using (true) with check (true);

-- ---------- Realtime ----------
do $$
begin
  alter publication supabase_realtime add table public.daily_steps;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
