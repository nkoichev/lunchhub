import { supabase, isSupabaseConfigured } from '../config/supabase';

// Upsert a star rating (1-5) for a dish by this user, at a given restaurant.
// Scoped by restaurant: the same dish name can exist at different
// restaurants and is rated independently at each.
//
// `extra` ({ comment, photoUrl }) is optional: fields left out are NOT sent,
// so re-tapping the stars keeps an existing written review/photo instead of
// wiping it (an upsert only overwrites the columns it's given).
export async function rateDish(user, restaurantId, itemName, stars, extra = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Базата данни не е настроена (вижте README).');
  }
  const row = { user_id: user.id, restaurant_id: restaurantId, item_name: itemName, stars };
  if (extra.comment !== undefined) row.comment = (extra.comment || '').trim() || null;
  if (extra.photoUrl !== undefined) row.photo_url = extra.photoUrl || null;
  const { error } = await supabase
    .from('ratings')
    .upsert(row, { onConflict: 'user_id,restaurant_id,item_name' });
  if (error) throw new Error(error.message);
}

// This user's own ratings at a restaurant, keyed by dish name.
export async function fetchMyRatings(user, restaurantId) {
  if (!isSupabaseConfigured || !restaurantId) return {};
  const { data, error } = await supabase
    .from('ratings')
    .select('item_name, stars, comment, photo_url')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId);
  if (error) throw new Error(error.message);

  const map = {};
  (data || []).forEach((r) => {
    map[r.item_name] = { stars: r.stars, comment: r.comment, photoUrl: r.photo_url };
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
    .select('user_id, stars, comment, photo_url, created_at, users(name, avatar_url)')
    .eq('restaurant_id', restaurantId)
    .eq('item_name', itemName)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    userId: r.user_id,
    name: r.users?.name ?? '—',
    stars: r.stars,
    comment: r.comment,
    photoUrl: r.photo_url,
    avatarUrl: r.users?.avatar_url ?? null,
    createdAt: r.created_at,
  }));
}

// base64 → bytes without extra dependencies (atob exists in Hermes + web).
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Upload a review photo to the public `dish-photos` bucket and return its
// public URL. `base64` comes straight from expo-image-picker.
export async function uploadDishPhoto(user, restaurantId, base64, mimeType = 'image/jpeg') {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${restaurantId}/${user.id}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('dish-photos')
    .upload(path, base64ToBytes(base64), { contentType: mimeType, upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('dish-photos').getPublicUrl(path).data.publicUrl;
}
