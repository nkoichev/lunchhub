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

// Each sign-in provider has its own identity column on users, so the same
// person can link both a Google and a Facebook account to one row.
const PROVIDER_COLUMNS = {
  google: 'auth_user_id',
  facebook: 'facebook_auth_user_id',
};
const PROVIDER_LABELS = { google: 'Google', facebook: 'Facebook' };

function columnFor(provider) {
  const col = PROVIDER_COLUMNS[provider];
  if (!col) throw new Error(`Непознат доставчик за вход: ${provider}`);
  return col;
}

// "Login with Google/Facebook": links (or creates) a users row for this
// identity. Matching priority:
//   1. auth user id — Supabase Auth's id for this exact identity, in any
//      provider's column (Supabase merges Google + Facebook sharing a
//      verified email into one auth user, so a Facebook login can land on a
//      row already linked via Google). Stable forever, so once a row is
//      linked this is an exact match with no name-guessing, working across
//      any later name/photo/script change.
//   2. name (case-insensitive) — convenience for the *first* login with a
//      provider, when the profile's name happens to spell the same as an
//      existing row. Only claims a row that isn't already linked to a
//      different identity of that same provider.
//   3. neither matches — this could be a genuinely new person, or the same
//      person under a name that doesn't match (e.g. a Cyrillic name-only
//      account vs. a Latin-script profile). Instead of guessing wrong and
//      creating a duplicate, this returns { needsLink: true } so the UI can
//      ask the person to pick themselves from the team list (see
//      listUnlinkedUsers / linkSocialAccount / createSocialUser below).
// Returns { id, name, avatarUrl } or { needsLink: true, profile }.
export async function upsertUserFromSocial({ name, avatarUrl, authUserId, provider }) {
  const col = columnFor(provider);
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error(`${PROVIDER_LABELS[provider]} акаунтът няма име.`);

  if (!isSupabaseConfigured) {
    return { id: `local-${cleanName.toLowerCase()}`, name: cleanName, avatarUrl: avatarUrl ?? null, local: true };
  }

  if (authUserId) {
    const idFilter = Object.values(PROVIDER_COLUMNS).map((c) => `${c}.eq.${authUserId}`).join(',');
    const { data: linked, error: linkErr } = await supabase
      .from('users')
      .select(`id, name, avatar_url, ${col}`)
      .or(idFilter)
      .limit(1)
      .maybeSingle();
    if (linkErr) throw new Error(linkErr.message);
    if (linked) {
      const patch = {};
      if (!linked[col]) patch[col] = authUserId;
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
    .select(`id, name, avatar_url, ${col}`)
    .ilike('name', cleanName)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing && !existing[col]) {
    const patch = { [col]: authUserId ?? null };
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

  return { needsLink: true, profile: { name: cleanName, avatarUrl: avatarUrl ?? null, authUserId, provider } };
}

// Users with no identity of this provider linked yet — candidates for the
// "which of these is you?" picker shown when upsertUserFromSocial can't
// auto-match.
export async function listUnlinkedUsers(provider) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .is(columnFor(provider), null)
    .order('name');
  if (error) throw new Error(error.message);
  return data.map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url }));
}

// Picking "this is me" in that picker: link the identity onto an existing
// row instead of creating a duplicate. Keeps the row's existing name (order
// history, etc. was recorded under it) — only the identity link and photo
// are added.
export async function linkSocialAccount(existingUserId, { authUserId, avatarUrl, provider }) {
  const patch = { [columnFor(provider)]: authUserId ?? null };
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
// row with the identity already linked, so it's matched exactly on every
// future login without ever needing the picker again.
export async function createSocialUser({ name, avatarUrl, authUserId, provider }) {
  const { data, error } = await supabase
    .from('users')
    .insert({ name: (name || '').trim(), avatar_url: avatarUrl || null, [columnFor(provider)]: authUserId ?? null })
    .select('id, name, avatar_url')
    .single();
  if (error) throw new Error(error.message);
  return toUser(data);
}
