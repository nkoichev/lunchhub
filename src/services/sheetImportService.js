import { supabase, isSupabaseConfigured } from '../config/supabase';

// The team's live Google Sheet — "Orders" tab. Test-only import tool: lets
// us seed the app's database from the real orders already being tracked
// there, instead of typing them in by hand.
const SHEET_ID = '1Uj_mn4WmRdeHeB51--az4bq7-sOZuVBDJZH-xlnPOeQ';
const ORDERS_GID = '1111813048';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${ORDERS_GID}`;

// Map a free-text restaurant name from the sheet to one of our restaurant
// ids. Unmapped names are reported back rather than guessed.
const RESTAURANT_ALIASES = [
  { match: /вере/i, id: 'malkata-vereya' },
  { match: /манджа/i, id: 'mandzhata' },
  { match: /язия|язи/i, id: 'yaziya' },
];

function mapRestaurant(raw) {
  const found = RESTAURANT_ALIASES.find((a) => a.match.test(raw || ''));
  return found?.id ?? null;
}

// Minimal RFC4180 CSV parser — handles quoted fields with embedded commas
// and doubled "" quotes, which the sheet's timestamp column needs.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// "Thursday, 20 August 2026 г. в 9:11: ч." -> "2026-08-20"
// Built by hand (not via `new Date(string)`) because free-text date parsing
// is implementation-defined and Hermes (React Native's JS engine) fails to
// parse formats that work fine in Node/V8 during local testing.
function parseSheetDate(raw) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(raw || '');
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(m[1]).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

// Fetch + parse the sheet into { rows, unmappedRestaurants } without
// writing anything — used to preview before committing.
export async function fetchSheetOrders() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Google Sheets отговори с ${res.status}.`);
  const text = await res.text();
  const table = parseCsv(text);

  // Header is the first row containing "Client".
  const headerIdx = table.findIndex((r) => r.includes('Client'));
  if (headerIdx === -1) throw new Error('Не намерих колона "Client" в таблицата.');
  const header = table[headerIdx];
  const col = {
    name: header.indexOf('Client'),
    restaurant: header.indexOf('restorant'),
    dish: header.indexOf('desc'),
    price: header.indexOf('price'),
    discPrice: header.indexOf('disc_price'),
    quantity: header.indexOf('quant'),
  };

  const rows = [];
  const unmapped = new Set();
  for (const r of table.slice(headerIdx + 1)) {
    const name = (r[col.name] || '').trim();
    const dish = (r[col.dish] || '').trim();
    const quantity = parseInt(r[col.quantity], 10);
    if (!name || !dish || !quantity) continue;

    const restaurantRaw = (r[col.restaurant] || '').trim();
    const restaurantId = mapRestaurant(restaurantRaw);
    if (!restaurantId) unmapped.add(restaurantRaw || '(празно)');

    const priceRaw = parseFloat(r[col.discPrice]) || parseFloat(r[col.price]) || 0;
    const dateStr = parseSheetDate(r[r.length - 1]);

    rows.push({
      name,
      restaurantRaw,
      restaurantId,
      dish,
      price: priceRaw,
      quantity,
      date: dateStr,
    });
  }

  return { rows, unmappedRestaurants: [...unmapped] };
}

// Group parsed rows into one cart per (name, restaurant, date), find/create
// each user, and replace that day's order for them with this cart — safe
// to re-run: it syncs to the sheet's current state rather than piling up
// duplicates. Does NOT send push notifications (this is a bulk backfill,
// not someone placing a fresh order).
export async function importSheetOrders(rows) {
  if (!isSupabaseConfigured) throw new Error('Базата данни не е настроена.');

  const groups = new Map();
  for (const r of rows) {
    if (!r.restaurantId || !r.date) continue;
    const key = `${r.name.toLowerCase()}|${r.restaurantId}|${r.date}`;
    if (!groups.has(key)) {
      groups.set(key, { name: r.name, restaurantId: r.restaurantId, date: r.date, items: [] });
    }
    groups.get(key).items.push({ name: r.dish, price: r.price, quantity: r.quantity });
  }

  const { data: restaurants } = await supabase.from('restaurants').select('id, name');
  const restaurantName = Object.fromEntries((restaurants || []).map((x) => [x.id, x.name]));

  const userCache = new Map();
  async function findOrCreateUser(name) {
    const key = name.toLowerCase();
    if (userCache.has(key)) return userCache.get(key);
    const { data: existing } = await supabase.from('users').select('id, name').ilike('name', name).maybeSingle();
    let user = existing;
    if (!user) {
      const { data: created, error } = await supabase.from('users').insert({ name }).select('id, name').single();
      if (error) throw new Error(error.message);
      user = created;
    }
    userCache.set(key, user);
    return user;
  }

  let created = 0;
  let updated = 0;

  for (const g of groups.values()) {
    const user = await findOrCreateUser(g.name);
    const total = g.items.reduce((s, i) => s + i.price * i.quantity, 0);

    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('restaurant_id', g.restaurantId)
      .eq('order_date', g.date)
      .maybeSingle();

    let orderId = existingOrder?.id;
    if (orderId) {
      await supabase.from('order_items').delete().eq('order_id', orderId);
      const { error } = await supabase.from('orders').update({ total }).eq('id', orderId);
      if (error) throw new Error(error.message);
      updated++;
    } else {
      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          order_date: g.date,
          total,
          restaurant_id: g.restaurantId,
          restaurant_name: restaurantName[g.restaurantId] ?? g.restaurantId,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      orderId = order.id;
      created++;
    }

    const itemRows = g.items.map((i) => ({
      order_id: orderId,
      item_name: i.name,
      price: i.price,
      quantity: i.quantity,
      line_total: i.price * i.quantity,
    }));
    const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
    if (itemsErr) throw new Error(itemsErr.message);
  }

  const skippedNoRestaurant = new Set(rows.filter((r) => !r.restaurantId).map((r) => r.name));
  const skippedNoDate = new Set(rows.filter((r) => r.restaurantId && !r.date).map((r) => r.name));

  return {
    createdOrders: created,
    updatedOrders: updated,
    people: [...new Set([...groups.values()].map((g) => g.name))],
    skippedNoRestaurant: [...skippedNoRestaurant],
    skippedNoDate: [...skippedNoDate],
  };
}
