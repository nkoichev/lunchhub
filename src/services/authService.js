import { supabase, isSupabaseConfigured } from '../config/supabase';

function toUser(row) {
  return { id: row.id, name: row.name, avatarUrl: row.avatar_url ?? null };
}

// "Login with name": find or create a user row by unique name.
// Returns { id, name, avatarUrl }.
export async function loginWithName(rawName) {
  const name = (rawName || '').trim();
  if (!name) throw new Error('Моля, въведете име.');
  if (name.length < 2) throw new Error('Името е твърде кратко.');

  if (!isSupabaseConfigured) {
    // Offline / demo mode: fabricate a stable local id from the name.
    return { id: `local-${name.toLowerCase()}`, name, avatarUrl: null, local: true };
  }

  // Try to find existing user (case-insensitive).
  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .ilike('name', name)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existing) {
    // Same person, different capitalization — adopt whatever they just
    // typed instead of being stuck with how the name was first entered.
    if (existing.name !== name) {
      const { data: renamed, error: renameErr } = await supabase
        .from('users')
        .update({ name })
        .eq('id', existing.id)
        .select('id, name, avatar_url')
        .single();
      if (!renameErr && renamed) return toUser(renamed);
    }
    return toUser(existing);
  }

  // Create a new user.
  const { data: created, error: insErr } = await supabase
    .from('users')
    .insert({ name })
    .select('id, name, avatar_url')
    .single();

  if (insErr) {
    // Unique-violation race: fetch again.
    const { data: retry } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .ilike('name', name)
      .maybeSingle();
    if (retry) return toUser(retry);
    throw new Error(insErr.message);
  }
  return toUser(created);
}

// "Login with Google": links (or creates) a users row for this Google
// identity, matched by name the same way loginWithName does — Google
// sign-in and name-only sign-in share the same users table, so a person
// who later switches methods keeps the same order history. Keeps
// avatar_url in sync with the current Google profile photo.
// Returns { id, name, avatarUrl }.
export async function upsertUserFromGoogle({ name, avatarUrl }) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Google акаунтът няма име.');

  if (!isSupabaseConfigured) {
    return { id: `local-${cleanName.toLowerCase()}`, name: cleanName, avatarUrl: avatarUrl ?? null, local: true };
  }

  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .ilike('name', cleanName)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing) {
    const patch = {};
    if (existing.name !== cleanName) patch.name = cleanName;
    if (avatarUrl && existing.avatar_url !== avatarUrl) patch.avatar_url = avatarUrl;
    if (Object.keys(patch).length === 0) return toUser(existing);
    const { data: updated, error: updErr } = await supabase
      .from('users')
      .update(patch)
      .eq('id', existing.id)
      .select('id, name, avatar_url')
      .single();
    if (updErr) throw new Error(updErr.message);
    return toUser(updated);
  }

  const { data: created, error: insErr } = await supabase
    .from('users')
    .insert({ name: cleanName, avatar_url: avatarUrl || null })
    .select('id, name, avatar_url')
    .single();
  if (insErr) {
    const { data: retry } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .ilike('name', cleanName)
      .maybeSingle();
    if (retry) return toUser(retry);
    throw new Error(insErr.message);
  }
  return toUser(created);
}
