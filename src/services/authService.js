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
// identity. Matching priority:
//   1. auth_user_id — Supabase Auth's id for this exact Google identity.
//      Stable forever, so once a row is linked this is an exact match with
//      no name-guessing, working across any later name/photo/script change.
//   2. name (case-insensitive) — convenience for the *first* Google login,
//      when the Google profile's name happens to spell the same as an
//      existing name-only row. Only claims a row that isn't already linked
//      to a different Google identity.
//   3. neither matches — this could be a genuinely new person, or the same
//      person under a name that doesn't match (e.g. a Cyrillic name-only
//      account vs. a Latin-script Google profile). Instead of guessing
//      wrong and creating a duplicate, this returns { needsLink: true } so
//      the UI can ask the person to pick themselves from the team list (see
//      listUnlinkedUsers / linkGoogleAccount / createGoogleUser below).
// Returns { id, name, avatarUrl } or { needsLink: true, profile }.
export async function upsertUserFromGoogle({ name, avatarUrl, authUserId }) {
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('Google акаунтът няма име.');

  if (!isSupabaseConfigured) {
    return { id: `local-${cleanName.toLowerCase()}`, name: cleanName, avatarUrl: avatarUrl ?? null, local: true };
  }

  if (authUserId) {
    const { data: linked, error: linkErr } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (linkErr) throw new Error(linkErr.message);
    if (linked) {
      const patch = {};
      if (avatarUrl && linked.avatar_url !== avatarUrl) patch.avatar_url = avatarUrl;
      if (Object.keys(patch).length === 0) return toUser(linked);
      const { data: updated, error: updErr } = await supabase
        .from('users')
        .update(patch)
        .eq('id', linked.id)
        .select('id, name, avatar_url')
        .single();
      if (updErr) throw new Error(updErr.message);
      return toUser(updated);
    }
  }

  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('id, name, avatar_url, auth_user_id')
    .ilike('name', cleanName)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing && !existing.auth_user_id) {
    const patch = { auth_user_id: authUserId ?? null };
    if (avatarUrl && existing.avatar_url !== avatarUrl) patch.avatar_url = avatarUrl;
    const { data: updated, error: updErr } = await supabase
      .from('users')
      .update(patch)
      .eq('id', existing.id)
      .select('id, name, avatar_url')
      .single();
    if (updErr) throw new Error(updErr.message);
    return toUser(updated);
  }

  return { needsLink: true, profile: { name: cleanName, avatarUrl: avatarUrl ?? null, authUserId } };
}

// Users with no Google identity linked yet — candidates for the "which of
// these is you?" picker shown when upsertUserFromGoogle can't auto-match.
export async function listUnlinkedUsers() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .is('auth_user_id', null)
    .order('name');
  if (error) throw new Error(error.message);
  return data.map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url }));
}

// Picking "this is me" in that picker: link the Google identity onto an
// existing row instead of creating a duplicate. Keeps the row's existing
// name (order history, etc. was recorded under it) — only the identity link
// and photo are added.
export async function linkGoogleAccount(existingUserId, { authUserId, avatarUrl }) {
  const patch = { auth_user_id: authUserId ?? null };
  if (avatarUrl) patch.avatar_url = avatarUrl;
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', existingUserId)
    .select('id, name, avatar_url')
    .single();
  if (error) throw new Error(error.message);
  return toUser(data);
}

// Picking "нов съм" in that picker: a genuinely new person — create their
// row with the Google identity already linked, so it's matched exactly on
// every future login without ever needing the picker again.
export async function createGoogleUser({ name, avatarUrl, authUserId }) {
  const { data, error } = await supabase
    .from('users')
    .insert({ name: (name || '').trim(), avatar_url: avatarUrl || null, auth_user_id: authUserId ?? null })
    .select('id, name, avatar_url')
    .single();
  if (error) throw new Error(error.message);
  return toUser(data);
}
