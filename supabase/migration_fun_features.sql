-- ============================================================
--  Migration: "fun" features
--    * order_reactions  — emoji reactions on today's orders
--    * ratings.photo_url — photo attached to a dish review
--    * dish-photos      — public Storage bucket for those photos
--    * push_log         — de-duplicates scheduled pushes (one per kind/day)
--    * pg_cron jobs     — lunch reminder + monthly "Wrapped" push
--  Run this once in the Supabase SQL Editor.
-- ============================================================

-- ---------- ORDER REACTIONS ----------
-- One row per (order, person, emoji): tapping the same emoji again removes it.
create table if not exists public.order_reactions (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  unique (order_id, user_id, emoji)
);
create index if not exists order_reactions_order_idx on public.order_reactions(order_id);

alter table public.order_reactions enable row level security;
drop policy if exists "anon_all_order_reactions" on public.order_reactions;
create policy "anon_all_order_reactions" on public.order_reactions
  for all using (true) with check (true);
-- Same as the live DB's other tables: signed-in (authenticated) clients only, no anon.
grant select, insert, update, delete on public.order_reactions to authenticated, service_role;

alter publication supabase_realtime add table public.order_reactions;

-- ---------- REVIEW PHOTOS ----------
alter table public.ratings add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "dish_photos_read" on storage.objects;
create policy "dish_photos_read" on storage.objects
  for select using (bucket_id = 'dish-photos');
drop policy if exists "dish_photos_write" on storage.objects;
create policy "dish_photos_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'dish-photos');
drop policy if exists "dish_photos_update" on storage.objects;
create policy "dish_photos_update" on storage.objects
  for update to authenticated using (bucket_id = 'dish-photos');

-- ---------- PUSH LOG ----------
-- The cron job fires every few minutes; this unique key is what makes the
-- reminder go out at most once per day (and Wrapped once per month).
create table if not exists public.push_log (
  kind     text not null,
  sent_on  date not null default current_date,
  sent_at  timestamptz not null default now(),
  primary key (kind, sent_on)
);
alter table public.push_log enable row level security;
-- No policies: only the Edge Function (service role) touches it.
grant select, insert, update, delete on public.push_log to service_role;

notify pgrst, 'reload schema';

-- ---------- SCHEDULED PUSHES (pg_cron + pg_net) ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Then
-- replace <CRON_SECRET> with the same value you set as the Edge Function
-- secret:  npx supabase secrets set CRON_SECRET=...
-- Times are UTC; the function itself checks Bulgarian time, so these just
-- need to cover the window in both winter (UTC+2) and summer (UTC+3).
--
-- select cron.schedule(
--   'lunch-reminder',
--   '*/5 7-10 * * 1-5',
--   $$ select net.http_post(
--        url     := 'https://pdywobzszjcqfwkxzjsg.supabase.co/functions/v1/lunch-reminder',
--        headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
--        body    := '{"kind":"reminder"}'::jsonb
--      ) $$
-- );
--
-- select cron.schedule(
--   'lunch-wrapped',
--   '0 8 1 * *',
--   $$ select net.http_post(
--        url     := 'https://pdywobzszjcqfwkxzjsg.supabase.co/functions/v1/lunch-reminder',
--        headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
--        body    := '{"kind":"wrapped"}'::jsonb
--      ) $$
-- );
