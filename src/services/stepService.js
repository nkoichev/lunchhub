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

// Save (insert or overwrite) a user's step count for a given day. Always a
// manual entry — takes precedence over any past/future device sync for
// that day (see syncStepsFromDevice).
export async function saveSteps(user, steps, date = todayDateString()) {
  if (!isSupabaseConfigured) {
    throw new Error('Базата данни не е настроена (вижте README).');
  }
  const n = Math.round(Number(steps));
  if (!Number.isFinite(n) || n < 0) throw new Error('Въведете валиден брой стъпки.');
  if (n > MAX_STEPS) throw new Error(`Твърде много стъпки (макс. ${MAX_STEPS.toLocaleString('bg-BG')}).`);

  const { error } = await supabase
    .from('daily_steps')
    .upsert(
      { user_id: user.id, step_date: date, steps: n, source: 'manual', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,step_date' }
    );
  if (error) throw new Error(error.message);
  return n;
}

// Auto-sync entries pulled from the phone's Health Connect data. Never
// overwrites a day the user has already typed in themselves — a 'manual'
// row always wins. `entries` is [{ date, steps }, ...].
export async function syncStepsFromDevice(user, entries) {
  if (!isSupabaseConfigured || !user || !entries?.length) return;

  const clean = entries
    .map((e) => ({ date: e.date, steps: Math.round(Number(e.steps)) }))
    .filter((e) => Number.isFinite(e.steps) && e.steps >= 0 && e.steps <= MAX_STEPS);
  if (!clean.length) return;

  const dates = clean.map((e) => e.date);
  const { data: existing, error: fetchError } = await supabase
    .from('daily_steps')
    .select('step_date, source')
    .eq('user_id', user.id)
    .in('step_date', dates);
  if (fetchError) throw new Error(fetchError.message);

  const manualDates = new Set((existing || []).filter((r) => r.source === 'manual').map((r) => r.step_date));
  const rows = clean
    .filter((e) => !manualDates.has(e.date))
    .map((e) => ({
      user_id: user.id,
      step_date: e.date,
      steps: e.steps,
      source: 'device',
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return;

  const { error } = await supabase.from('daily_steps').upsert(rows, { onConflict: 'user_id,step_date' });
  if (error) throw new Error(error.message);
}

// This user's own step entries for the last `days` days, keyed by date.
export async function fetchMyRecentSteps(user, days = 7) {
  if (!isSupabaseConfigured || !user) return {};
  const { data, error } = await supabase
    .from('daily_steps')
    .select('step_date, steps')
    .eq('user_id', user.id)
    .gte('step_date', dateStringDaysAgo(days - 1))
    .order('step_date', { ascending: true });
  if (error) throw new Error(error.message);

  const map = {};
  (data || []).forEach((r) => {
    map[r.step_date] = Number(r.steps);
  });
  return map;
}

// Everyone's step entries, newest first, with names joined. Aggregated
// client-side (per range) the same way the History charts are.
export async function fetchAllSteps(limit = 3000) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('daily_steps')
    .select('step_date, steps, source, user_id, users(name)')
    .order('step_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    date: r.step_date,
    steps: Number(r.steps),
    source: r.source,
    userId: r.user_id,
    userName: r.users?.name ?? '—',
  }));
}
