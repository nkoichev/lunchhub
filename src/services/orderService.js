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
// cart: [{ name, price, quantity }]
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
      .select('id, item_name, quantity')
      .eq('order_id', existing.id);
    const byName = {};
    (existingItems || []).forEach((it) => {
      byName[it.item_name] = it;
    });

    const toInsert = [];
    for (const i of cart) {
      const match = byName[i.name];
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
    .select('id, order_date, total, restaurant_id, restaurant_name, user_id')
    .eq('id', orderId)
    .single();
  if (error) throw new Error(error.message);

  const { data: items } = await supabase
    .from('order_items')
    .select('item_name, price, quantity, line_total')
    .eq('order_id', orderId);

  return { ...order, items: items || [] };
}

// Replace the items of an existing order (edit/correct).
// items: [{ name, price, quantity }]
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

  const { data, error } = await supabase
    .from('today_orders')
    .select('client, user_id, total, item_name, quantity, line_total, order_id, restaurant_name, revolut_tag, is_paid');
  if (error) throw new Error(error.message);

  const map = {};
  let grandTotal = 0;
  (data || []).forEach((row) => {
    // key by order so a person ordering from 2 restaurants shows 2 cards
    const key = row.order_id;
    if (!map[key]) {
      map[key] = {
        name: row.client,
        userId: row.user_id,
        items: [],
        total: 0,
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
    });
    map[key].total += Number(row.line_total);
    grandTotal += Number(row.line_total);
  });

  const people = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  return { people, grandTotal };
}

// A user's full order history, newest first.
export async function fetchHistory(user) {
  if (!isSupabaseConfigured) return [];

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_date, total, restaurant_id, restaurant_name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  if (!orders?.length) return [];

  const ids = orders.map((o) => o.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('order_id, item_name, quantity, line_total')
    .in('order_id', ids);

  const byOrder = {};
  (items || []).forEach((it) => {
    (byOrder[it.order_id] ??= []).push(it);
  });

  return orders.map((o) => ({
    ...o,
    items: byOrder[o.id] ?? [],
  }));
}

// Everyone's order history, newest first (for the shared History tab).
export async function fetchAllHistory(limit = 200) {
  if (!isSupabaseConfigured) return [];

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_date, total, restaurant_name, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!orders?.length) return [];

  const orderIds = orders.map((o) => o.id);
  const userIds = [...new Set(orders.map((o) => o.user_id))];

  const [{ data: items }, { data: users }] = await Promise.all([
    supabase
      .from('order_items')
      .select('order_id, item_name, quantity, line_total')
      .in('order_id', orderIds),
    supabase.from('users').select('id, name').in('id', userIds),
  ]);

  const byOrder = {};
  (items || []).forEach((it) => {
    (byOrder[it.order_id] ??= []).push(it);
  });
  const nameById = {};
  (users || []).forEach((u) => {
    nameById[u.id] = u.name;
  });

  return orders.map((o) => ({
    id: o.id,
    date: o.order_date,
    total: Number(o.total),
    restaurantName: o.restaurant_name ?? '—',
    userId: o.user_id,
    userName: nameById[o.user_id] ?? '—',
    items: byOrder[o.id] ?? [],
  }));
}
