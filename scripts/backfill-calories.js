// One-time backfill: estimate calories for every existing menu_items row
// that doesn't have one yet, via the estimate-calories Edge Function.
// New/edited dishes get this automatically going forward (see
// src/services/menuAdminService.js) — this script only needs to run once
// against dishes that existed before that wiring went in.
//
// Usage:
//   SUPABASE_URL=https://xxxxx.supabase.co \
//   SUPABASE_ANON_KEY=xxxxx \
//   node scripts/backfill-calories.js
//
// Requires the estimate-calories function to already be deployed with a
// GEMINI_API_KEY secret set (see supabase/functions/estimate-calories).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY env vars first (see app.json -> expo.extra).');
  process.exit(1);
}

// PostgREST returns 204 No Content (empty body) for a PATCH by default, so
// this can't unconditionally call res.json() — only parse when there's
// actually a body.
async function supabaseFetch(path, init) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function estimateCalories(name, category) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/estimate-calories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ name, category }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`estimate-calories -> ${res.status}: ${text}`);
  const data = text ? JSON.parse(text) : {};
  return Number.isFinite(data.calories) ? data.calories : null;
}

async function main() {
  const NON_FOOD_NAMES = new Set(['кутия']);
  const allDishes = await supabaseFetch(
    '/rest/v1/menu_items?calories=is.null&select=id,name,category'
  );
  const dishes = allDishes.filter((d) => !NON_FOOD_NAMES.has(d.name.trim().toLowerCase()));
  console.log(`${dishes.length} dish(es) without a calorie estimate.`);

  let done = 0;
  let failed = 0;
  for (const dish of dishes) {
    try {
      const calories = await estimateCalories(dish.name, dish.category);
      if (calories === null) {
        failed++;
        console.warn(`  ✗ ${dish.name} — no estimate returned`);
        continue;
      }
      await supabaseFetch(`/rest/v1/menu_items?id=eq.${dish.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ calories }),
      });
      done++;
      console.log(`  ✓ ${dish.name} — ${calories} kcal`);
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${dish.name} — ${e.message}`);
    }
    // Free tier is 15 requests/minute (not per-day, despite the quotaId
    // name) — 4.5s keeps us under that with margin.
    await new Promise((r) => setTimeout(r, 4500));
  }

  console.log(`\nDone: ${done} updated, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
