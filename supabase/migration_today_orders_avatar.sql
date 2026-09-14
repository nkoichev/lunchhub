-- ============================================================
--  Migration: avatar on the "who ordered today" view
--  Lets TodayScreen show each person's real profile photo next to their
--  order instead of a plain initial letter — useful now that a first name
--  alone doesn't always tell two people apart at a glance.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

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
  u.avatar_url
from public.orders o
join public.users u        on u.id = o.user_id
join public.order_items oi on oi.order_id = o.id
where o.order_date = current_date;

notify pgrst, 'reload schema';
