-- ============================================================
--  Migration: multi-restaurant support + order editing
--  Run this ONCE in Supabase SQL Editor if you already ran the
--  original schema.sql. (New installs get this from schema.sql.)
-- ============================================================

-- 1) Tie each order to a restaurant.
alter table public.orders
  add column if not exists restaurant_id   text references public.restaurants(id),
  add column if not exists restaurant_name text;

-- 2) Rebuild the "who ordered what today" view to include the restaurant.
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
