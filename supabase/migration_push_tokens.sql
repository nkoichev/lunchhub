-- ============================================================
--  Migration: push notification device tokens
--  Needed for "someone placed an order" push notifications.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "anon_all_push_tokens" on public.push_tokens;
create policy "anon_all_push_tokens" on public.push_tokens for all using (true) with check (true);

notify pgrst, 'reload schema';

-- Explicit Data API grants (Supabase stops auto-granting new public tables on 2026-10-30)
grant select on public.push_tokens to anon;
grant select, insert, update, delete on public.push_tokens to authenticated, service_role;
