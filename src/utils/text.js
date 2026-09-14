// A stored name can be a full name (typed at name-only login, or a Google
// profile's full_name/name fallback) — greetings only have room for one
// word, so this trims to just the first.
export function firstNameOf(name) {
  return (name || '').trim().split(/\s+/)[0] || '';
}
