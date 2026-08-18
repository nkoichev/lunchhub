import { supabase, isSupabaseConfigured } from '../config/supabase';

// Upsert a star rating (1-5) for a dish by this user, at a given restaurant.
// Scoped by restaurant: the same dish name can exist at different
// restaurants and is rated independently at each.
export async function rateDish(user, restaurantId, itemName, stars, comment = null) {
  if (!isSupabaseConfigured) {
    throw new Error('Базата данни не е настроена (вижте README).');
  }
  const { error } = await supabase
    .from('ratings')
    .upsert(
      { user_id: user.id, restaurant_id: restaurantId, item_name: itemName, stars, comment },
      { onConflict: 'user_id,restaurant_id,item_name' }
    );
  if (error) throw new Error(error.message);
}

// This user's own ratings at a restaurant, keyed by dish name.
export async function fetchMyRatings(user, restaurantId) {
  if (!isSupabaseConfigured || !restaurantId) return {};
  const { data, error } = await supabase
    .from('ratings')
    .select('item_name, stars, comment')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId);
  if (error) throw new Error(error.message);

  const map = {};
  (data || []).forEach((r) => {
    map[r.item_name] = { stars: r.stars, comment: r.comment };
  });
  return map;
}

// Top-rated dishes for the team, at a given restaurant.
export async function fetchTopRated(restaurantId, limit = 20) {
  if (!isSupabaseConfigured || !restaurantId) return [];
  const { data, error } = await supabase
    .from('rating_summary')
    .select('item_name, avg_stars, votes')
    .eq('restaurant_id', restaurantId)
    .order('avg_stars', { ascending: false })
    .order('votes', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

// Everyone who rated a dish at a restaurant, with their name and when.
export async function fetchRatersForDish(restaurantId, itemName) {
  if (!isSupabaseConfigured || !restaurantId) return [];
  const { data, error } = await supabase
    .from('ratings')
    .select('user_id, stars, comment, created_at, users(name)')
    .eq('restaurant_id', restaurantId)
    .eq('item_name', itemName)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    userId: r.user_id,
    name: r.users?.name ?? '—',
    stars: r.stars,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}
