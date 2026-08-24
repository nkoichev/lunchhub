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
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
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
  if (!res.ok) throw new Error(`estimate-calories -> ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Number.isFinite(data.calories) ? data.calories : null;
}

async function main() {
  const dishes = await supabaseFetch(
    '/rest/v1/menu_items?calories=is.null&select=id,name,category'
  );
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
    // Stay well under the free-tier rate limit.
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nDone: ${done} updated, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
