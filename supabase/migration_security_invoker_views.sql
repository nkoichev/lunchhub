-- ============================================================
--  Migration: fix "Security Definer View" advisor warnings
--  Postgres views run with the OWNER's privileges by default, which
--  silently bypasses Row Level Security on the underlying tables —
--  a view can leak data an RLS policy was meant to hide, and stays
--  broken even if you tighten RLS later. security_invoker makes the
--  view run with the QUERYING role's privileges (and RLS) instead.
--  Currently harmless here (RLS policies allow full anon access
--  anyway), but this closes the gap for if/when that's tightened.
--  Run this once in the Supabase SQL Editor.
-- ============================================================

create or replace view public.rating_summary
with (security_invoker = on) as
select
  restaurant_id,
  item_name,
  round(avg(stars)::numeric, 1) as avg_stars,
  count(*)                      as votes
from public.ratings
group by restaurant_id, item_name;

create or replace view public.today_orders
with (security_invoker = on) as
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

notify pgrst, 'reload schema';
