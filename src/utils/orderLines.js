// Helpers for order lines that may be "for" a colleague other than the
// person placing the order. A line is { name, price, quantity, forName },
// where forName === null means the dish is for the order's owner. The same
// dish for two different people is two separate lines.

export const sameLine = (a, b) =>
  a.name === b.name && (a.forName ?? null) === (b.forName ?? null);

// Trimmed name, or null when empty or when it's just the owner themself.
export function normalizeForName(forName, ownerName) {
  const clean = (forName ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  if (ownerName && clean.toLowerCase() === ownerName.trim().toLowerCase()) return null;
  return clean;
}

// Move `qty` units of lines[index] to `forName` (all of them when qty is
// omitted or >= the line's quantity). Units land on an existing line for the
// same dish+person if there is one, otherwise on a new line right after.
export function moveUnits(lines, index, forName, qty) {
  const src = lines[index];
  if (!src) return lines;
  const target = forName ?? null;
  const n = Math.min(Math.max(1, qty ?? src.quantity), src.quantity);
  if ((src.forName ?? null) === target) return lines;

  const next = lines.map((l) => ({ ...l }));
  next[index].quantity -= n;
  const existingIdx = next.findIndex(
    (l, i) => i !== index && sameLine(l, { name: src.name, forName: target })
  );
  if (existingIdx >= 0) {
    next[existingIdx].quantity += n;
  } else {
    next.splice(index + 1, 0, { ...src, quantity: n, forName: target });
  }
  return next.filter((l) => l.quantity > 0);
}

// Group lines by who they're for: owner's own lines first, then each
// colleague alphabetically. -> [{ forName, items, total }]
export function groupByForName(items, getTotal) {
  const groups = new Map();
  items.forEach((it) => {
    const key = it.forName ?? null;
    if (!groups.has(key)) groups.set(key, { forName: key, items: [], total: 0 });
    const g = groups.get(key);
    g.items.push(it);
    g.total += getTotal(it);
  });
  return [...groups.values()].sort((a, b) => {
    if (a.forName === null) return -1;
    if (b.forName === null) return 1;
    return a.forName.localeCompare(b.forName);
  });
}
