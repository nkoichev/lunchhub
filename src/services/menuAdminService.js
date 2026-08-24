import { supabase, isSupabaseConfigured } from '../config/supabase';
import { estimateCalories } from './calorieService';

// Turn a (possibly Cyrillic) name into a url-safe restaurant id.
function slugify(name) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
    ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
  };
  const lower = (name || '').toLowerCase().trim();
  let out = '';
  for (const ch of lower) {
    if (map[ch]) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[\s-]/.test(ch)) out += '-';
  }
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return out || `rest-${Date.now()}`;
}

// ---------- Restaurants ----------
export async function addRestaurant(name) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const trimmed = (name || '').trim();
  if (trimmed.length < 2) throw new Error('Въведете име на ресторант.');

  let id = slugify(trimmed);
  const { data: existing } = await supabase
    .from('restaurants')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existing) id = `${id}-${Math.floor(Math.random() * 1000)}`;

  const { data, error } = await supabase
    .from('restaurants')
    .insert({ id, name: trimmed })
    .select('id, name')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Dishes (the "Mandji" catalog) ----------
export async function fetchDishes(restaurantId) {
  if (!isSupabaseConfigured || !restaurantId) return [];
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, price, category, day_index, calories')
    .eq('restaurant_id', restaurantId)
    .order('day_index', { ascending: true })
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// Menu items with the same (trimmed, case-insensitive) name that would end
// up shown on the same day — either the exact weekday, or via the
// "Всеки ден" (day_index 0) catch-all, which overlaps every specific day.
async function findConflictingDish({ restaurantId, name, dayIndex, excludeId }) {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, day_index')
    .eq('restaurant_id', restaurantId)
    .ilike('name', name.trim());
  if (error) throw new Error(error.message);
  return (data || []).find(
    (row) =>
      row.id !== excludeId &&
      (dayIndex === 0 || row.day_index === 0 || row.day_index === dayIndex)
  );
}

export async function addDish({ restaurantId, name, price, dayIndex, category }) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  if (!(name || '').trim()) throw new Error('Въведете име на ястие.');
  const conflict = await findConflictingDish({ restaurantId, name, dayIndex });
  if (conflict) {
    throw new Error('Вече има ястие с това име за този ден. Редактирайте съществуващото вместо да добавяте ново.');
  }
  const calories = await estimateCalories(name.trim(), category);
  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      restaurant_id: restaurantId,
      name: name.trim(),
      price: Number(price) || 0,
      day_index: dayIndex,
      category,
      calories,
    })
    .select('id, name, price, category, day_index, calories')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDish(id, { restaurantId, name, price, dayIndex, category }) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Въведете име на ястие.');
  if (restaurantId) {
    const conflict = await findConflictingDish({ restaurantId, name, dayIndex, excludeId: id });
    if (conflict) {
      throw new Error('Вече има друго ястие с това име за този ден.');
    }
  }

  const patch = {
    name: trimmedName,
    price: Number(price) || 0,
    day_index: dayIndex,
    category,
  };

  // Only re-estimate (and only overwrite) if the dish's identity actually
  // changed — avoids wiping a good existing estimate on a failed/rate-
  // limited call, and avoids a needless API call on every price/day edit.
  const { data: current } = await supabase
    .from('menu_items')
    .select('name, category')
    .eq('id', id)
    .maybeSingle();
  if (!current || current.name !== trimmedName || current.category !== category) {
    const calories = await estimateCalories(trimmedName, category);
    if (calories !== null) patch.calories = calories;
  }

  const { error } = await supabase.from('menu_items').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteDish(id) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
