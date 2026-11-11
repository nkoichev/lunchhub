-- ============================================================
--  Migration: "for whom" on each ordered dish
--  When someone orders through their own account for colleagues, each
--  order line can name the colleague it's actually for. Free text (not a
--  users FK) so a colleague who has never used the app can still be named.
--  NULL = the dish is for the order's owner.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter table public.order_items add column if not exists for_name text;

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
  oi.for_name
from public.orders o
join public.users u        on u.id = o.user_id
join public.order_items oi on oi.order_id = o.id
where o.order_date = current_date;

notify pgrst, 'reload schema';
