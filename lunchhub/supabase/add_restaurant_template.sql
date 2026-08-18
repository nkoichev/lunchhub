-- ============================================================
--  Template: add a new restaurant + its weekly menu
--  Copy this, change the values, and run in Supabase SQL Editor.
--  day_index: 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri
--  category:  'soup' | 'salad' | 'main' | 'dessert'
-- ============================================================

-- 1) The restaurant. Give it a short unique id (lowercase, dashes).
insert into public.restaurants (id, name) values
  ('restaurant-two', 'Име на ресторанта')
  on conflict (id) do update set name = excluded.name;

-- 2) (Optional) clear its old menu before reseeding.
delete from public.menu_items where restaurant_id = 'restaurant-two';

-- 3) The dishes. Add as many rows as you need.
insert into public.menu_items (restaurant_id, day_index, name, price, category) values
  ('restaurant-two', 1, 'Пример супа',     2.50, 'soup'),
  ('restaurant-two', 1, 'Пример основно',  4.20, 'main'),
  ('restaurant-two', 1, 'Пример салата',   3.00, 'salad'),
  ('restaurant-two', 2, 'Вторник основно', 4.00, 'main');
  -- ...continue for each day
