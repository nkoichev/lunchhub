import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config/supabase';

// See supabase/functions/estimate-calories/index.ts — keeps the Gemini key
// server-side instead of shipping it in the app bundle.
const ESTIMATE_CALORIES_URL = `${SUPABASE_URL}/functions/v1/estimate-calories`;

// Rough, best-effort calorie estimate for a dish. Never throws — a failed
// estimate (no Gemini key set up yet, rate limit, etc.) must not block
// adding/editing a dish; it just leaves `calories` unset for now.
export async function estimateCalories(name, category) {
  if (!isSupabaseConfigured || !(name || '').trim()) return null;
  try {
    const res = await fetch(ESTIMATE_CALORIES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ name, category }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Number.isFinite(data.calories) ? data.calories : null;
  } catch (_) {
    return null;
  }
}
