-- ============================================================
--  LunchHub database schema  (Supabase / PostgreSQL)
--  Run this once in the Supabase SQL Editor.
-- ============================================================

-- ---------- USERS ----------
-- "Login with name": no passwords, just a unique display name.
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
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
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  order_date      date not null default current_date,
  total           numeric(8,2) not null default 0,
  restaurant_id   text references public.restaurants(id),
  restaurant_name text,
  created_at      timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders(user_id);
create index if not exists orders_date_idx on public.orders(order_date);

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

-- ---------- AGGREGATE VIEW: average rating per dish, per restaurant ----------
create or replace view public.rating_summary as
select
  restaurant_id,
  item_name,
  round(avg(stars)::numeric, 1) as avg_stars,
  count(*)                      as votes
from public.ratings
group by restaurant_id, item_name;

-- ---------- TODAY'S SUMMARY VIEW: who ordered what today ----------
create or replace view public.today_orders as
select
  o.id              as order_id,
  o.user_id         as user_id,
  u.name            as client,
  o.order_date,
  o.total,
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

do $$
declare t text;
begin
  foreach t in array array['users','restaurants','menu_items','orders','order_items','ratings']
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
