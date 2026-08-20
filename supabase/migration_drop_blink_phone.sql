-- ============================================================
--  Migration: remove Blink as a payout method (reverted feature)
--  Run this once in the Supabase SQL Editor.
-- ============================================================

drop view if exists public.today_orders;
create view public.today_orders
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

alter table public.users drop column if exists blink_phone;

notify pgrst, 'reload schema';
