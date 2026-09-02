import { supabase, isSupabaseConfigured } from '../config/supabase';
import { todayDateString } from './orderService';

// Re-export so screens can get "today" from one place.
export { todayDateString };

export const MAX_STEPS = 300000;

// Local calendar date `daysAgo` days before today, as 'YYYY-MM-DD'.
export function dateStringDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Upsert step entries pulled from the phone's Health Connect data.
// `entries` is [{ date, steps }, ...]. Steps come only from the device, so
// a later sync simply overwrites an earlier value for the same day.
export async function syncStepsFromDevice(user, entries) {
  if (!isSupabaseConfigured || !user || !entries?.length) return;

  const rows = entries
    .map((e) => ({ date: e.date, steps: Math.round(Number(e.steps)) }))
    .filter((e) => Number.isFinite(e.steps) && e.steps >= 0 && e.steps <= MAX_STEPS)
    .map((e) => ({
      user_id: user.id,
      step_date: e.date,
      steps: e.steps,
      source: 'device',
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return;

  const { error } = await supabase
    .from('daily_steps')
    .upsert(rows, { onConflict: 'user_id,step_date' });
  if (error) throw new Error(error.message);
}

// Everyone's step entries, newest first, with names joined. Aggregated
// client-side (per range) the same way the History charts are.
export async function fetchAllSteps(limit = 3000) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('daily_steps')
    .select('step_date, steps, user_id, users(name)')
    .order('step_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    date: r.step_date,
    steps: Number(r.steps),
    userId: r.user_id,
    userName: r.users?.name ?? '—',
  }));
}
