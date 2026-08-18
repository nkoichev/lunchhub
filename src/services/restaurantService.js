import { supabase, isSupabaseConfigured } from '../config/supabase';
import { RESTAURANT } from '../data/menu';

// List all restaurants (for the selector buttons).
export async function fetchRestaurants() {
  if (!isSupabaseConfigured) return [RESTAURANT];

  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data && data.length ? data : [RESTAURANT];
}
