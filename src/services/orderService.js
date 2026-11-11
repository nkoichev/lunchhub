import { supabase, isSupabaseConfigured } from '../config/supabase';
import { notifyOrderPlaced } from './pushService';

// Local calendar date as 'YYYY-MM-DD', matching the `date` column's format.
// Trusts the device clock, same as the rest of the app (e.g. the menu's
// default weekday) — fine for a single-city team.
export function todayDateString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Place an order for the given user at the given restaurant. If they
// already have an order today at the same restaurant, the cart is merged
// into it (quantities added, new dishes appended) instead of creating a
// second, separate order for the same person/place/day.
// cart: [{ name, price, quantity, forName }] — forName null = for the user.
export async function placeOrder(user, cart, restaurant) {
  if (!cart.length) throw new Error('Кошницата е празна.');
  if (!isSupabaseConfigured) {
    throw new Error(
      'Базата данни не е настроена. Добавете Supabase ключове (вижте README).'
    );
  }

  const addedTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  let existingQuery = supabase
    .from('orders')
    .select('id, total')
    .eq('user_id', user.id)
    .eq('order_date', todayDateString());
  existingQuery = restaurant?.id
    ? existingQuery.eq('restaurant_id', restaurant.id)
    : existingQuery.is('restaurant_id', null);
  const { data: existingMatches } = await existingQuery
    .order('created_at', { ascending: false })
    .limit(1);
  const existing = existingMatches?.[0];

  let order;
  if (existing) {
    const { data: existingItems } = await supabase
      .from('order_items')
      .select('id, item_name, quantity, for_name')
      .eq('order_id', existing.id);
    // Same dish for a different colleague stays a separate line.
    const lineKey = (name, forName) => `${name}${forName ?? ''}`;
    const byKey = {};
    (existingItems || []).forEach((it) => {
      byKey[lineKey(it.item_name, it.for_name)] = it;
    });

    const toInsert = [];
    for (const i of cart) {
      const match = byKey[lineKey(i.name, i.forName)];
      if (match) {
        const quantity = match.quantity + i.quantity;
        const { error } = await supabase
          .from('order_items')
          .update({ quantity, line_total: i.price * quantity })
          .eq('id', match.id);
        if (error) throw new Error(error.message);
      } else {
        toInsert.push({
          order_id: existing.id,
          item_name: i.name,
          price: i.price,
          quantity: i.quantity,
          line_total: i.price * i.quantity,
          for_name: i.forName ?? null,
        });
      }
    }
    if (toInsert.length) {
      const { error } = await supabase.from('order_items').insert(toInsert);
      if (error) throw new Error(error.message);
    }

    const total = Number(existing.total) + addedTotal;
    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update({ total })
      .eq('id', existing.id)
      .select('id, order_date, total')
      .single();
    if (updErr) throw new Error(updErr.message);
    order = updated;
  } else {
    // If the team already picked today's payer, a brand-new order should
    // carry that too (setDayPayer only stamps orders that exist *before*
    // the pick — this covers ones placed after).
    const { data: dayPayer } = await supabase
      .from('day_payers')
      .select('payer_user_id')
      .eq('order_date', todayDateString())
      .maybeSingle();

    const { data: created, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        total: addedTotal,
        restaurant_id: restaurant?.id ?? null,
        restaurant_name: restaurant?.name ?? null,
        payer_user_id: dayPayer?.payer_user_id ?? null,
      })
      .select('id, order_date, total')
      .single();
    if (orderErr) throw new Error(orderErr.message);

    const rows = cart.map((i) => ({
      order_id: created.id,
      item_name: i.name,
      price: i.price,
      quantity: i.quantity,
      line_total: i.price * i.quantity,
      for_name: i.forName ?? null,
    }));
    const { error: itemsErr } = await supabase.from('order_items').insert(rows);
    if (itemsErr) throw new Error(itemsErr.message);
    order = created;
  }

  notifyOrderPlaced(user, restaurant?.name, cart, addedTotal);

  return order;
}

// Load a single order with its items (for the edit screen).
export async function fetchOrder(orderId) {
  if (!isSupabaseConfigured) return null;

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_date, total, restaurant_id, restaurant_name, user_id, users!orders_user_id_fkey(name)')
    .eq('id', orderId)
    .single();
  if (error) throw new Error(error.message);

  const { data: items } = await supabase
    .from('order_items')
    .select('item_name, price, quantity, line_total, for_name')
    .eq('order_id', orderId);

  const { users, ...rest } = order;
  return { ...rest, owner_name: users?.name ?? null, items: items || [] };
}

// Replace the items of an existing order (edit/correct).
// items: [{ name, price, quantity, forName }]
export async function updateOrder(orderId, items) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  if (!items.length) {
    // Nothing left -> delete the whole order instead.
    await deleteOrder(orderId);
    return { deleted: true };
  }

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  // Remove old lines, insert the new set, update the total.
  const { error: delErr } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId);
  if (delErr) throw new Error(delErr.message);

  const rows = items.map((i) => ({
    order_id: orderId,
    item_name: i.name,
    price: i.price,
    quantity: i.quantity,
    line_total: i.price * i.quantity,
    for_name: i.forName ?? null,
  }));
  const { error: insErr } = await supabase.from('order_items').insert(rows);
  if (insErr) throw new Error(insErr.message);

  const { error: updErr } = await supabase
    .from('orders')
    .update({ total })
    .eq('id', orderId);
  if (updErr) throw new Error(updErr.message);

  return { deleted: false, total };
}

// Delete an order (its items cascade automatically).
export async function deleteOrder(orderId) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  if (error) throw new Error(error.message);
}

// Everyone's orders for today, grouped by person.
export async function fetchTodaySummary() {
  if (!isSupabaseConfigured) return { people: [], grandTotal: 0 };

  const [{ data, error }, { data: menuItems }] = await Promise.all([
    supabase
      .from('today_orders')
      .select('client, user_id, avatar_url, total, item_name, quantity, line_total, order_id, restaurant_name, revolut_tag, is_paid, for_name'),
    supabase.from('menu_items').select('name, calories').not('calories', 'is', null),
  ]);
  if (error) throw new Error(error.message);

  // Dish names aren't a foreign key on order_items, so calories are looked
  // up by normalized name rather than joined — same reasoning as the
  // History charts' dish grouping (item names vary in casing over time).
  const caloriesByName = {};
  (menuItems || []).forEach((m) => {
    caloriesByName[m.name.trim().toLowerCase()] = m.calories;
  });

  const map = {};
  let grandTotal = 0;
  (data || []).forEach((row) => {
    // key by order so a person ordering from 2 restaurants shows 2 cards
    const key = row.order_id;
    if (!map[key]) {
      map[key] = {
        name: row.client,
        userId: row.user_id,
        avatarUrl: row.avatar_url,
        items: [],
        total: 0,
        totalCalories: 0,
        orderId: row.order_id,
        restaurantName: row.restaurant_name,
        revolutTag: row.revolut_tag,
        isPaid: row.is_paid,
      };
    }
    map[key].items.push({
      name: row.item_name,
      quantity: row.quantity,
      lineTotal: Number(row.line_total),
      forName: row.for_name ?? null,
    });
    map[key].total += Number(row.line_total);
    const calories = caloriesByName[row.item_name.trim().toLowerCase()];
    if (calories) map[key].totalCalories += calories * row.quantity;
    grandTotal += Number(row.line_total);
  });

  const people = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  return { people, grandTotal };
}

// Names to offer in the "for whom" picker: every app user plus anyone
// typed in by hand on an earlier order, de-duplicated case-insensitively.
export async function fetchColleagueNames() {
  if (!isSupabaseConfigured) return [];
  const [{ data: users }, { data: forNames }] = await Promise.all([
    supabase.from('users').select('name'),
    supabase
      .from('order_items')
      .select('for_name')
      .not('for_name', 'is', null)
      .limit(1000),
  ]);
  const seen = new Map();
  [...(users || []).map((u) => u.name), ...(forNames || []).map((r) => r.for_name)]
    .filter(Boolean)
    .forEach((n) => {
      const key = n.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, n.trim());
    });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// A user's full order history, newest first — the dishes they actually
// ate: their own orders minus lines ordered for colleagues, plus lines a
// colleague ordered for them (for_name = their name).
export async function fetchHistory(user) {
  if (!isSupabaseConfigured) return [];

  const [{ data: orders, error }, { data: forMe }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_date, total, restaurant_id, restaurant_name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('order_items')
      .select(
        'order_id, item_name, quantity, line_total, orders!inner(id, order_date, restaurant_id, restaurant_name, created_at)'
      )
      .ilike('for_name', user.name)
      .limit(500),
  ]);
  if (error) throw new Error(error.message);

  const byOrder = {};
  if (orders?.length) {
    const { data: items } = await supabase
      .from('order_items')
      .select('order_id, item_name, quantity, line_total, for_name')
      .in('order_id', orders.map((o) => o.id));
    (items || [])
      .filter((it) => !it.for_name)
      .forEach((it) => {
        (byOrder[it.order_id] ??= []).push(it);
      });
  }
  const own = (orders || [])
    .map((o) => ({ ...o, items: byOrder[o.id] ?? [] }))
    .filter((o) => o.items.length);

  const proxied = {};
  (forMe || []).forEach(({ orders: o, ...it }) => {
    (proxied[o.id] ??= { ...o, total: 0, items: [] }).items.push(it);
    proxied[o.id].total += Number(it.line_total);
  });

  return [...own, ...Object.values(proxied)].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

// Everyone's full order history, newest first (for the shared History tab).
// Fetched in pages because PostgREST caps each response (1000 rows by
// default); items are embedded so no huge `in(order_id, ...)` list is needed.
//
// Each order is split into one entry per person who actually eats from it:
// lines with a for_name become an entry for that colleague (as if they had
// ordered themselves, so per-person stats stay real), carrying `orderedBy`
// so the UI can note who placed it. `id` is unique per entry; `orderId` is
// the real order (for edit/delete) and `ownerId` the account that placed it.
const HISTORY_PAGE_SIZE = 1000;

export async function fetchAllHistory() {
  if (!isSupabaseConfigured) return [];

  const orders = [];
  for (let from = 0; ; from += HISTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_date, total, restaurant_name, created_at, user_id, order_items(item_name, quantity, line_total, for_name)'
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + HISTORY_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    orders.push(...(data || []));
    if (!data || data.length < HISTORY_PAGE_SIZE) break;
  }
  if (!orders.length) return [];

  // All users (not just order owners): a for_name may match someone who
  // has an account but never ordered on it themselves.
  const { data: users } = await supabase.from('users').select('id, name, avatar_url');

  const byId = {};
  const byLowerName = {};
  (users || []).forEach((u) => {
    byId[u.id] = u;
    byLowerName[u.name.trim().toLowerCase()] = u;
  });

  const entries = [];
  orders.forEach((o) => {
    const owner = byId[o.user_id];
    const ownerName = owner?.name ?? '—';
    const groups = new Map();
    (o.order_items ?? []).forEach((it) => {
      const forName = it.for_name?.trim() || null;
      const key = forName ? forName.toLowerCase() : null;
      if (!groups.has(key)) groups.set(key, { forName, items: [] });
      groups.get(key).items.push(it);
    });
    groups.forEach(({ forName, items }, key) => {
      const eater = key ? byLowerName[key] : owner;
      const isProxy = key !== null && eater?.id !== o.user_id;
      entries.push({
        id: key === null ? o.id : `${o.id}:${key}`,
        orderId: o.id,
        ownerId: o.user_id,
        orderedBy: isProxy ? ownerName : null,
        date: o.order_date,
        total: items.reduce((s, it) => s + Number(it.line_total), 0),
        restaurantName: o.restaurant_name ?? '—',
        userId: eater?.id ?? `name:${key}`,
        userName: eater?.name ?? (forName || ownerName),
        userAvatar: eater?.avatar_url ?? null,
        items,
      });
    });
  });
  return entries;
}
