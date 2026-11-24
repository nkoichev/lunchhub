// Badges, streaks and the monthly "Wrapped" — all computed client-side from
// data the app already stores (orders, steps, payers, ratings, calories).
// Nothing here writes to the database: a badge is "earned" simply because
// the history says so, which means new badge ideas apply retroactively.

import { supabase, isSupabaseConfigured } from '../config/supabase';
import { fetchAllHistory, todayDateString } from './orderService';
import { fetchAllSteps } from './stepService';

// Rough kcal burned per step for an average adult — good enough for a
// playful "did your walk cover lunch?" comparison, not for a diet plan.
export const KCAL_PER_STEP = 0.04;
export const STEP_GOAL = 10000;

const norm = (s) => (s || '').trim().toLowerCase();
export const isSoup = (name) => /суп|чорб|бульон|таратор|бобена|шкембе/.test(norm(name));
export const isDessert = (name) =>
  /баклав|торт|десерт|палачинк|сладолед|тирамису|крем карамел|мъфин|кекс|еклер|чийзкейк|сладк/.test(norm(name));

// ---------- data loading (cached briefly — several screens use it) ----------
let cache = null;
let cacheAt = 0;
let inflight = null;
const CACHE_MS = 2 * 60 * 1000;

export function invalidateFunData() {
  cache = null;
}

export async function loadFunData({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const empty = { orders: [], steps: [], payers: [], ratings: [], caloriesByName: {}, users: [] };
    if (!isSupabaseConfigured) return empty;
    const [orders, steps, payersRes, ratingsRes, menuRes, usersRes] = await Promise.all([
      fetchAllHistory().catch(() => []),
      fetchAllSteps(20000).catch(() => []),
      supabase.from('day_payers').select('order_date, payer_user_id'),
      supabase.from('ratings').select('user_id, item_name, comment, photo_url'),
      supabase.from('menu_items').select('name, calories').not('calories', 'is', null),
      supabase.from('users').select('id, name, avatar_url'),
    ]);
    const caloriesByName = {};
    (menuRes.data || []).forEach((m) => {
      caloriesByName[norm(m.name)] = m.calories;
    });
    return {
      orders,
      steps,
      payers: payersRes.data || [],
      ratings: ratingsRes.data || [],
      caloriesByName,
      users: usersRes.data || [],
    };
  })();
  try {
    cache = await inflight;
    cacheAt = Date.now();
    return cache;
  } finally {
    inflight = null;
  }
}

// ---------- helpers ----------
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return wd === 0 || wd === 6;
}

function orderCalories(order, caloriesByName) {
  return (order.items || []).reduce(
    (s, it) => s + (caloriesByName[norm(it.item_name)] || 0) * (it.quantity || 1),
    0
  );
}

// Consecutive days ending today (or yesterday, if today isn't done yet —
// a streak shouldn't look "broken" at 9am just because you haven't ordered).
// `skipWeekends` makes Saturday/Sunday neither extend nor break it.
function streakFrom(dateSet, { skipWeekends }) {
  const step = (d) => {
    let p = addDays(d, -1);
    while (skipWeekends && isWeekend(p)) p = addDays(p, -1);
    return p;
  };
  let cur = todayDateString();
  while (skipWeekends && isWeekend(cur)) cur = step(cur);
  if (!dateSet.has(cur)) cur = step(cur);
  let n = 0;
  while (dateSet.has(cur)) {
    n += 1;
    cur = step(cur);
  }
  return n;
}

function bestStreak(dateSet, { skipWeekends }) {
  const dates = [...dateSet].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  dates.forEach((d) => {
    let expected = prev ? addDays(prev, 1) : null;
    while (skipWeekends && expected && isWeekend(expected)) expected = addDays(expected, 1);
    run = prev && d === expected ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  });
  return best;
}

// First/last person to order each day (among days with 3+ people, so a
// two-person day doesn't hand out "last minute" trophies for free).
function firstLastCounts(orders) {
  const byDate = {};
  orders.forEach((o) => {
    if (!o.createdAt) return;
    (byDate[o.date] ??= []).push(o);
  });
  const first = {};
  const last = {};
  Object.values(byDate).forEach((list) => {
    const people = new Set(list.map((o) => o.userId));
    if (people.size < 3) return;
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const f = sorted[0].userId;
    const l = sorted[sorted.length - 1].userId;
    first[f] = (first[f] ?? 0) + 1;
    last[l] = (last[l] ?? 0) + 1;
  });
  return { first, last };
}

// ---------- badges ----------
const BADGES = [
  { id: 'regular', emoji: '🏅', title: 'Редовен клиент', desc: '50 поръчки', target: 50, value: (s) => s.orderDays },
  { id: 'soup', emoji: '🥣', title: 'Супермен на супите', desc: '20 супи', target: 20, value: (s) => s.soups },
  { id: 'explorer', emoji: '🧭', title: 'Изследовател', desc: 'Опитал 30 различни ястия', target: 30, value: (s) => s.distinctDishes },
  { id: 'sweet', emoji: '🍰', title: 'Сладкоежко', desc: '10 десерта', target: 10, value: (s) => s.desserts },
  { id: 'early', emoji: '🐦', title: 'Ранно пиле', desc: 'Пръв поръчал 10 пъти', target: 10, value: (s) => s.firstCount },
  { id: 'lastMinute', emoji: '🐢', title: 'Последна минута', desc: 'Последен поръчал 10 пъти', target: 10, value: (s) => s.lastCount },
  { id: 'patron', emoji: '💸', title: 'Меценат', desc: 'Платил сметката 10 пъти', target: 10, value: (s) => s.timesPaid },
  { id: 'critic', emoji: '🧐', title: 'Кулинарен критик', desc: 'Оценил 15 ястия', target: 15, value: (s) => s.ratingsCount },
  { id: 'reviewer', emoji: '📸', title: 'Фуд блогър', desc: '5 ревюта с текст или снимка', target: 5, value: (s) => s.reviewsCount },
  { id: 'burn', emoji: '🚶', title: 'Изгори си обяда', desc: '5 дни, в които стъпките покриха калориите от обяда', target: 5, value: (s) => s.burnDays },
  { id: 'marathon', emoji: '🏃', title: 'Маратонец', desc: 'Ден с 20 000 стъпки', target: 1, value: (s) => s.marathonDays },
  { id: 'streak', emoji: '🔥', title: 'В серия', desc: '10 работни дни поред с поръчка', target: 10, value: (s) => s.bestOrderStreak },
];

export function computeUserStats(userId, data) {
  const { orders, steps, payers, ratings, caloriesByName } = data;
  const mine = orders.filter((o) => o.userId === userId);

  const dishSet = new Set();
  let soups = 0;
  let desserts = 0;
  const kcalByDate = {};
  mine.forEach((o) => {
    (o.items || []).forEach((it) => {
      dishSet.add(norm(it.item_name));
      if (isSoup(it.item_name)) soups += it.quantity || 1;
      if (isDessert(it.item_name)) desserts += it.quantity || 1;
    });
    kcalByDate[o.date] = (kcalByDate[o.date] ?? 0) + orderCalories(o, caloriesByName);
  });

  const mySteps = steps.filter((s) => s.userId === userId);
  const stepsByDate = {};
  mySteps.forEach((s) => {
    stepsByDate[s.date] = s.steps;
  });
  const burnDays = Object.entries(kcalByDate).filter(
    ([d, kcal]) => kcal > 0 && (stepsByDate[d] ?? 0) * KCAL_PER_STEP >= kcal
  ).length;

  const { first, last } = firstLastCounts(orders);
  const orderDates = new Set(mine.map((o) => o.date));
  const stepGoalDates = new Set(mySteps.filter((s) => s.steps >= STEP_GOAL).map((s) => s.date));
  const myRatings = ratings.filter((r) => r.user_id === userId);

  const s = {
    orderDays: orderDates.size,
    soups,
    desserts,
    distinctDishes: dishSet.size,
    firstCount: first[userId] ?? 0,
    lastCount: last[userId] ?? 0,
    timesPaid: payers.filter((p) => p.payer_user_id === userId).length,
    ratingsCount: myRatings.length,
    reviewsCount: myRatings.filter((r) => (r.comment && r.comment.trim()) || r.photo_url).length,
    burnDays,
    marathonDays: mySteps.filter((x) => x.steps >= 20000).length,
    orderStreak: streakFrom(orderDates, { skipWeekends: true }),
    bestOrderStreak: bestStreak(orderDates, { skipWeekends: true }),
    stepStreak: streakFrom(stepGoalDates, { skipWeekends: false }),
    bestStepStreak: bestStreak(stepGoalDates, { skipWeekends: false }),
  };

  const badges = BADGES.map((b) => {
    const value = b.value(s);
    return {
      id: b.id,
      emoji: b.emoji,
      title: b.title,
      desc: b.desc,
      value: Math.min(value, b.target),
      target: b.target,
      earned: value >= b.target,
    };
  });

  return { ...s, badges, earnedCount: badges.filter((b) => b.earned).length };
}

// Small per-person summary for the Today cards: streak + up to 3 badges.
export function computeTeamFlair(data) {
  const ids = new Set(data.orders.map((o) => o.userId));
  const out = {};
  ids.forEach((id) => {
    const st = computeUserStats(id, data);
    out[id] = {
      orderStreak: st.orderStreak,
      stepStreak: st.stepStreak,
      badges: st.badges.filter((b) => b.earned).map((b) => b.emoji).slice(0, 3),
    };
  });
  return out;
}

// ---------- Wrapped ----------
const MONTHS_BG = [
  'януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

export function periodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  if (period === 'thisYear') {
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y} година` };
  }
  if (period === 'lastMonth') {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return { from: fmt(start), to: fmt(end), label: `${MONTHS_BG[start.getMonth()]} ${start.getFullYear()}` };
  }
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return { from: fmt(start), to: fmt(end), label: `${MONTHS_BG[m]} ${y}` };
}

function persona(stats) {
  if (stats.orders === 0) return { emoji: '👻', title: 'Призрак', line: 'Не те видяхме на обяд този път.' };
  if (stats.soupShare >= 0.5) return { emoji: '🥣', title: 'Супаджия', line: 'Супата не е предястие — тя е начин на живот.' };
  if (stats.dessertShare >= 0.25) return { emoji: '🍰', title: 'Сладкоежко', line: 'Животът е кратък. Първо десерта.' };
  if (stats.distinctShare >= 0.8) return { emoji: '🧭', title: 'Изследовател', line: 'Всеки ден нещо ново — менюто те познава.' };
  if (stats.favDish && stats.favDishCount >= Math.max(3, stats.orders * 0.4)) {
    return { emoji: '🎯', title: 'Верен на вкуса', line: `${stats.favDish} — защо да сменяш нещо, което работи?` };
  }
  if (stats.avgSteps >= STEP_GOAL) return { emoji: '🏃', title: 'Атлет на обяда', line: 'Ядеш като шампион и ходиш като такъв.' };
  return { emoji: '😋', title: 'Ценител', line: 'Балансиран избор, стабилен апетит.' };
}

export function computeWrapped(userId, data, period = 'thisMonth') {
  const { from, to, label } = periodRange(period);
  const inRange = (d) => d >= from && d <= to;
  const { orders, steps, payers, caloriesByName, users } = data;
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? '—';

  const periodOrders = orders.filter((o) => inRange(o.date));
  const mine = periodOrders.filter((o) => o.userId === userId);

  const dishCount = {};
  const restCount = {};
  let items = 0;
  let soups = 0;
  let desserts = 0;
  let kcal = 0;
  mine.forEach((o) => {
    restCount[o.restaurantName] = (restCount[o.restaurantName] ?? 0) + 1;
    kcal += orderCalories(o, caloriesByName);
    (o.items || []).forEach((it) => {
      const q = it.quantity || 1;
      dishCount[it.item_name] = (dishCount[it.item_name] ?? 0) + q;
      items += q;
      if (isSoup(it.item_name)) soups += q;
      if (isDessert(it.item_name)) desserts += q;
    });
  });
  const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const [favDish, favDishCount] = top(dishCount);
  const [favRestaurant, favRestaurantCount] = top(restCount);
  const spent = mine.reduce((s, o) => s + o.total, 0);
  const priciest = [...mine].sort((a, b) => b.total - a.total)[0] ?? null;

  // Ever-before dishes, to count what was new this period.
  const before = new Set(
    orders
      .filter((o) => o.userId === userId && o.date < from)
      .flatMap((o) => (o.items || []).map((it) => norm(it.item_name)))
  );
  const newDishes = Object.keys(dishCount).filter((n) => !before.has(norm(n))).length;

  // Food twin: who ordered the same dish on the same day as you most often.
  const myKeys = new Set(mine.flatMap((o) => (o.items || []).map((it) => `${o.date}|${norm(it.item_name)}`)));
  const twinCount = {};
  periodOrders
    .filter((o) => o.userId !== userId)
    .forEach((o) =>
      (o.items || []).forEach((it) => {
        if (myKeys.has(`${o.date}|${norm(it.item_name)}`)) twinCount[o.userId] = (twinCount[o.userId] ?? 0) + 1;
      })
    );
  const [twinId, twinMatches] = top(twinCount);

  // Team rank by number of lunches.
  const perPerson = {};
  periodOrders.forEach((o) => {
    perPerson[o.userId] = (perPerson[o.userId] ??= new Set()).add(o.date);
  });
  const ranking = Object.entries(perPerson)
    .map(([id, set]) => [id, set.size])
    .sort((a, b) => b[1] - a[1]);
  const rank = ranking.findIndex(([id]) => id === userId) + 1;

  const mySteps = steps.filter((s) => s.userId === userId && inRange(s.date));
  const totalSteps = mySteps.reduce((s, x) => s + x.steps, 0);
  const bestStepDay = [...mySteps].sort((a, b) => b.steps - a.steps)[0] ?? null;
  const avgSteps = mySteps.length ? Math.round(totalSteps / mySteps.length) : 0;

  const lunches = new Set(mine.map((o) => o.date)).size;
  const stats = {
    label,
    period,
    orders: lunches,
    items,
    spent,
    avgPerLunch: lunches ? spent / lunches : 0,
    favDish,
    favDishCount,
    favRestaurant,
    favRestaurantCount,
    distinctDishes: Object.keys(dishCount).length,
    newDishes,
    kcal,
    priciest: priciest ? { date: priciest.date, total: priciest.total } : null,
    twin: twinId ? { name: nameOf(twinId), matches: twinMatches } : null,
    rank,
    teamSize: ranking.length,
    totalSteps,
    avgSteps,
    bestStepDay: bestStepDay ? { date: bestStepDay.date, steps: bestStepDay.steps } : null,
    burnedKcal: Math.round(totalSteps * KCAL_PER_STEP),
    timesPaid: payers.filter((p) => p.payer_user_id === userId && inRange(p.order_date)).length,
    soupShare: items ? soups / items : 0,
    dessertShare: items ? desserts / items : 0,
    distinctShare: items ? Object.keys(dishCount).length / items : 0,
  };
  return { ...stats, persona: persona(stats) };
}

// Plain-text version for the Share sheet.
export function wrappedShareText(name, w) {
  const lines = [
    `🎁 LunchHub Wrapped · ${w.label}`,
    `${w.persona.emoji} ${name} — „${w.persona.title}“`,
    `🍽️ ${w.orders} обяда · ${w.spent.toFixed(2)} €`,
  ];
  if (w.favDish) lines.push(`❤️ Любимо: ${w.favDish} (×${w.favDishCount})`);
  if (w.twin) lines.push(`👯 Хранителен близнак: ${w.twin.name}`);
  if (w.totalSteps) lines.push(`👟 ${w.totalSteps.toLocaleString('bg-BG')} стъпки`);
  if (w.kcal) lines.push(`🔥 ${w.kcal.toLocaleString('bg-BG')} ккал изядени, ${w.burnedKcal.toLocaleString('bg-BG')} изгорени`);
  return lines.join('\n');
}

// Today's lunch calories vs. calories walked off today, with a cheeky line.
export function burnVerdict(lunchKcal, todaySteps) {
  const burned = Math.round((todaySteps || 0) * KCAL_PER_STEP);
  if (!lunchKcal) return { burned, ratio: 0, line: '' };
  const ratio = burned / lunchKcal;
  const stepsLeft = Math.max(0, Math.ceil((lunchKcal - burned) / KCAL_PER_STEP));
  let line;
  if (ratio >= 1) line = 'Обядът е изгорен! Можеш спокойно да си вземеш и десерт 😎';
  else if (ratio >= 0.6) line = `Почти! Още ~${stepsLeft.toLocaleString('bg-BG')} стъпки и си на нула 💪`;
  else if (ratio >= 0.25) line = `Разходка след обяда? Трябват ти ~${stepsLeft.toLocaleString('bg-BG')} стъпки 🚶`;
  else line = `Диванът те вика, но ~${stepsLeft.toLocaleString('bg-BG')} стъпки викат по-силно 🛋️`;
  return { burned, ratio, line };
}
