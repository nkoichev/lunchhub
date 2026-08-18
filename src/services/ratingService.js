import { supabase, isSupabaseConfigured } from '../config/supabase';

// Upsert a star rating (1-5) for a dish by this user.
export async function rateDish(user, itemName, stars, comment = null) {
  if (!isSupabaseConfigured) {
    throw new Error('Базата данни не е настроена (вижте README).');
  }
  const { error } = await supabase
    .from('ratings')
    .upsert(
      { user_id: user.id, item_name: itemName, stars, comment },
      { onConflict: 'user_id,item_name' }
    );
  if (error) throw new Error(error.message);
}

// This user's own ratings, keyed by dish name.
export async function fetchMyRatings(user) {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase
    .from('ratings')
    .select('item_name, stars, comment')
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);

  const map = {};
  (data || []).forEach((r) => {
    map[r.item_name] = { stars: r.stars, comment: r.comment };
  });
  return map;
}

// Top-rated dishes across the whole team.
export async function fetchTopRated(limit = 20) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('rating_summary')
    .select('item_name, avg_stars, votes')
    .order('avg_stars', { ascending: false })
    .order('votes', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}
