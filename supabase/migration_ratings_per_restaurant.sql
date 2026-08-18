-- ============================================================
--  Migration: scope ratings to a restaurant
--  Same dish name can exist at different restaurants (prepared
--  differently), so a rating for "Таратор" at one restaurant must
--  not show up for "Таратор" at another. Run this once in the
--  Supabase SQL Editor.
-- ============================================================

alter table public.ratings
  add column if not exists restaurant_id text references public.restaurants(id) on delete cascade;

-- Backfill: match each existing rating to the restaurant of the user's most
-- recent order that contained a dish with that name.
update public.ratings r
set restaurant_id = sub.restaurant_id
from (
  select distinct on (o.user_id, oi.item_name)
    o.user_id, oi.item_name, o.restaurant_id
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.restaurant_id is not null
  order by o.user_id, oi.item_name, o.created_at desc
) sub
where r.user_id = sub.user_id
  and r.item_name = sub.item_name
  and r.restaurant_id is null;

-- Any rating that still couldn't be matched to a restaurant (rated a dish
-- with no corresponding order on record) is orphaned data — drop it rather
-- than guess which restaurant it belongs to.
delete from public.ratings where restaurant_id is null;

alter table public.ratings alter column restaurant_id set not null;

alter table public.ratings drop constraint if exists ratings_user_id_item_name_key;
alter table public.ratings drop constraint if exists ratings_user_id_restaurant_id_item_name_key;
alter table public.ratings
  add constraint ratings_user_id_restaurant_id_item_name_key unique (user_id, restaurant_id, item_name);

drop index if exists ratings_item_idx;
create index if not exists ratings_restaurant_item_idx on public.ratings(restaurant_id, item_name);

-- ---------- AGGREGATE VIEW: average rating per dish, per restaurant ----------
-- Dropped and recreated (not CREATE OR REPLACE) because the new
-- restaurant_id column goes before item_name, and Postgres won't let
-- CREATE OR REPLACE VIEW change an existing column's position/name.
drop view if exists public.rating_summary;
create view public.rating_summary as
select
  restaurant_id,
  item_name,
  round(avg(stars)::numeric, 1) as avg_stars,
  count(*)                      as votes
from public.ratings
group by restaurant_id, item_name;

notify pgrst, 'reload schema';
