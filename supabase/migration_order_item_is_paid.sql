-- ============================================================
--  Migration: per-colleague "paid" flag on order lines
--  When someone orders for colleagues, each colleague settles with the
--  day's payee on their own — so "Платено" is tracked per for_name group
--  of lines, not only per order (orders.is_paid still covers the owner's
--  own dishes).
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.order_items add column if not exists is_paid boolean not null default false;

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
  oi.line_total,
  u.avatar_url,
  oi.for_name,
  oi.is_paid        as item_is_paid
from public.orders o
join public.users u        on u.id = o.user_id
join public.order_items oi on oi.order_id = o.id
where o.order_date = current_date;

notify pgrst, 'reload schema';
