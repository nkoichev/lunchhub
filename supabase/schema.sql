-- ============================================================
--  LunchHub database schema  (Supabase / PostgreSQL)
--  Run this once in the Supabase SQL Editor.
-- ============================================================

-- The team orders lunch from Bulgaria, but Postgres defaults to UTC.
-- Without this, current_date/now() roll over to the next day 2-3 hours
-- late (Bulgaria is UTC+2/+3), so an order placed just after local
-- midnight is still dated "yesterday" and lands in the wrong day's list.
alter database postgres set timezone to 'Europe/Sofia';

-- ---------- USERS ----------
-- "Login with name": no passwords, just a unique display name.
-- revolut_tag: optional payout detail a user sets for themselves, used
-- when they're picked as the day's payer so others know where to send
-- their share.
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now(),
  revolut_tag text
);

-- ---------- RESTAURANTS ----------
create table if not exists public.restaurants (
  id      text primary key,
  name    text not null
);

-- ---------- MENU ITEMS ----------
-- One row per dish per weekday. day_index: 1=Mon ... 5=Fri.
create table if not exists public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  text not null references public.restaurants(id) on delete cascade,
  day_index      int  not null check (day_index between 1 and 7),
  name           text not null,
  price          numeric(6,2) not null default 0,
  category       text default 'main'
);
create index if not exists menu_items_day_idx on public.menu_items(day_index);
create index if not exists menu_items_name_idx on public.menu_items(name);

-- ---------- ORDERS ----------
-- is_paid / payer_user_id: split-bill tracking — payer_user_id is stamped
-- with that day's picked payer (see day_payers below), is_paid is toggled
-- once the order's owner has settled up with them.
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  order_date      date not null default current_date,
  total           numeric(8,2) not null default 0,
  restaurant_id   text references public.restaurants(id),
  restaurant_name text,
  created_at      timestamptz not null default now(),
  is_paid         boolean not null default false,
  payer_user_id   uuid references public.users(id) on delete set null
);
create index if not exists orders_user_idx on public.orders(user_id);
create index if not exists orders_date_idx on public.orders(order_date);

-- ---------- DAY PAYERS ----------
-- One payer per calendar day — whoever fronts the restaurant bill and gets
-- paid back by everyone else via Revolut.
create table if not exists public.day_payers (
  order_date     date primary key,
  payer_user_id  uuid not null references public.users(id) on delete cascade,
  updated_at     timestamptz not null default now()
);

-- ---------- ORDER ITEMS ----------
create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  item_name  text not null,
  price      numeric(6,2) not null default 0,
  quantity   int not null default 1,
  line_total numeric(8,2) not null default 0
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ---------- RATINGS ----------
-- One rating per user per dish name per restaurant (upsert to update).
-- Scoped by restaurant because the same dish name can exist at different
-- restaurants, prepared differently, and rates independently.
create table if not exists public.ratings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  restaurant_id  text not null references public.restaurants(id) on delete cascade,
  item_name      text not null,
  stars          int  not null check (stars between 1 and 5),
  comment        text,
  created_at     timestamptz not null default now(),
  unique (user_id, restaurant_id, item_name)
);
create index if not exists ratings_restaurant_item_idx on public.ratings(restaurant_id, item_name);

-- ---------- PUSH TOKENS ----------
-- One row per device. A user can have the app on more than one phone;
-- a device's token is re-associated with whoever is logged in on it.
create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

-- ---------- DAILY STEPS ----------
-- One row per user per calendar day for the "Стъпки" tab (personal trend
-- + team leaderboard + head-to-head comparison). Re-logging a day upserts
-- on the unique pair instead of stacking rows.
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

-- ---------- AGGREGATE VIEW: average rating per dish, per restaurant ----------
-- security_invoker: the view runs with the QUERYING role's privileges (and
-- RLS) instead of the view owner's — otherwise a view silently bypasses any
-- RLS policy on its underlying tables, even ones added later.
create or replace view public.rating_summary
with (security_invoker = on) as
select
  restaurant_id,
  item_name,
  round(avg(stars)::numeric, 1) as avg_stars,
  count(*)                      as votes
from public.ratings
group by restaurant_id, item_name;

-- ---------- TODAY'S SUMMARY VIEW: who ordered what today ----------
create or replace view public.today_orders
with (security_invoker = on) as
select
  o.id              as order_id,
  o.user_id         as user_id,
  u.name            as client,
  u.revolut_tag,
  o.order_date,
  o.total,
  o.is_paid,
  o.restaurant_id,
  o.restaurant_name,
  oi.item_name,
  oi.quantity,
  oi.line_total
from public.orders o
join public.users u        on u.id = o.user_id
join public.order_items oi on oi.order_id = o.id
where o.order_date = current_date;

-- ============================================================
--  Row Level Security
--  This is a small trusted team app using the anon key, so we
--  allow full access with the anon role. Tighten later if needed.
-- ============================================================
alter table public.users       enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items  enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.ratings     enable row level security;
alter table public.push_tokens enable row level security;
alter table public.day_payers  enable row level security;
alter table public.daily_steps enable row level security;

do $$
declare t text;
begin
  foreach t in array array['users','restaurants','menu_items','orders','order_items','ratings','push_tokens','day_payers','daily_steps']
  loop
    execute format(
      'drop policy if exists "anon_all_%1$s" on public.%1$s;', t);
    execute format(
      'create policy "anon_all_%1$s" on public.%1$s for all using (true) with check (true);', t);
  end loop;
end $$;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.ratings;
alter publication supabase_realtime add table public.daily_steps;
