-- ============================================================
--  Migration: use Bulgaria's local time for "today"
--  Postgres defaults to UTC. Bulgaria is UTC+2/+3, so current_date
--  (used for orders.order_date and the today_orders view) rolls over
--  to the next day 2-3 hours late — an order placed just after local
--  midnight still gets dated "yesterday" and shows up mixed into
--  yesterday's orders instead of starting a fresh "today".
--  Run this once in the Supabase SQL Editor.
-- ============================================================

alter database postgres set timezone to 'Europe/Sofia';

-- New connections pick this up immediately; already-open ones (e.g. a
-- pooled connection PostgREST is mid-using) pick it up on their next
-- reconnect, which happens naturally within a few minutes.
