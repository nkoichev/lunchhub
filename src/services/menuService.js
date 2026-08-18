import { supabase, isSupabaseConfigured } from '../config/supabase';
import { localMenuForDay, RESTAURANT } from '../data/menu';

// Fetch the menu for a given restaurant + weekday, merged with average ratings.
export async function fetchMenu(restaurantId, dayIndex) {
  const rid = restaurantId ?? RESTAURANT.id;

  if (!isSupabaseConfigured) {
    return localMenuForDay(dayIndex).map((it) => ({
      ...it,
      avg_stars: null,
      votes: 0,
    }));
  }

  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id, name, price, category, day_index')
    .eq('restaurant_id', rid)
    .or(`day_index.eq.${dayIndex},day_index.eq.0`)
    .order('category', { ascending: true })
    .order('price', { ascending: true });

  if (error) throw new Error(error.message);

  // Pull rating averages for this restaurant and merge by dish name — the
  // same dish name can exist at a different restaurant with its own ratings.
  const { data: ratings } = await supabase
    .from('rating_summary')
    .select('item_name, avg_stars, votes')
    .eq('restaurant_id', rid);

  const ratingMap = {};
  (ratings || []).forEach((r) => {
    ratingMap[r.item_name] = { avg_stars: r.avg_stars, votes: r.votes };
  });

  return (items || []).map((it) => ({
    ...it,
    avg_stars: ratingMap[it.name]?.avg_stars ?? null,
    votes: ratingMap[it.name]?.votes ?? 0,
  }));
}
