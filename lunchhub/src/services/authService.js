import { supabase, isSupabaseConfigured } from '../config/supabase';

// "Login with name": find or create a user row by unique name.
// Returns { id, name }.
export async function loginWithName(rawName) {
  const name = (rawName || '').trim();
  if (!name) throw new Error('Моля, въведете име.');
  if (name.length < 2) throw new Error('Името е твърде кратко.');

  if (!isSupabaseConfigured) {
    // Offline / demo mode: fabricate a stable local id from the name.
    return { id: `local-${name.toLowerCase()}`, name, local: true };
  }

  // Try to find existing user (case-insensitive).
  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existing) return existing;

  // Create a new user.
  const { data: created, error: insErr } = await supabase
    .from('users')
    .insert({ name })
    .select('id, name')
    .single();

  if (insErr) {
    // Unique-violation race: fetch again.
    const { data: retry } = await supabase
      .from('users')
      .select('id, name')
      .ilike('name', name)
      .maybeSingle();
    if (retry) return retry;
    throw new Error(insErr.message);
  }
  return created;
}
