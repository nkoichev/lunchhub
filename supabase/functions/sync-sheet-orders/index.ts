// Auto-sync of today's orders from the team's Google Sheet ("Orders" tab) —
// the scheduled twin of the "📥 Импорт от Sheets" button in ManageScreen
// (src/services/sheetImportService.js). Keep the parsing in sync with it.
//
// Called by pg_cron every 20 min (see migration_sheet_sync.sql). It only
// does work on weekdays between SYNC_FROM and SYNC_TO Bulgarian time, and
// only when the sheet's CSV actually changed since the last run (sha-256 in
// sheet_sync_state). Then, per (person, restaurant) for TODAY only, it
// creates the order if missing, or rewrites its lines if they differ from
// the sheet. Orders already matching the sheet are left untouched; nothing
// is ever deleted at the order level, and "Платено" flags on lines are
// carried over by dish name. No push notifications.
//
// Deploy with:  npx supabase functions deploy sync-sheet-orders --no-verify-jwt
// Secrets:      CRON_SECRET (required, shared with lunch-reminder),
//               SYNC_FROM (default "10:00"), SYNC_TO (default "14:00")
// Manual run:   POST with {"force":true} — ignores the time window and the hash.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const SYNC_FROM = Deno.env.get('SYNC_FROM') ?? '10:00';
const SYNC_TO = Deno.env.get('SYNC_TO') ?? '14:00';

const SHEET_ID = '1Uj_mn4WmRdeHeB51--az4bq7-sOZuVBDJZH-xlnPOeQ';
const ORDERS_GID = '1111813048';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${ORDERS_GID}`;

const RESTAURANT_ALIASES = [
  { match: /вере/i, id: 'malkata-vereya' },
  { match: /манджа/i, id: 'mandzhata' },
  { match: /язия|язи/i, id: 'yaziya' },
  { match: /щастлив/i, id: 'shtastlivetsa' },
  { match: /lindo|линдо/i, id: 'lindo' },
];
const mapRestaurant = (raw: string) => RESTAURANT_ALIASES.find((a) => a.match.test(raw || ''))?.id ?? null;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// "Thursday, 20 August 2026 г. в 9:11: ч." -> "2026-08-20"
function parseSheetDate(raw: string) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(raw || '');
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

function sofiaNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: get('weekday'),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Item = { name: string; price: number; quantity: number };
const signature = (items: Item[]) =>
  items.map((i) => `${i.name.trim().toLowerCase()}|${Number(i.price).toFixed(2)}|${i.quantity}`).sort().join('\n');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  try {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase credentials missing');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { force = false } = await req.json().catch(() => ({}));
    const now = sofiaNow();
    if (!force) {
      if (['Sat', 'Sun'].includes(now.weekday)) return json({ skipped: 'weekend' });
      if (now.minutes < toMinutes(SYNC_FROM) || now.minutes > toMinutes(SYNC_TO)) {
        return json({ skipped: 'outside window', now: now.minutes });
      }
    }

    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`Google Sheets responded ${res.status}`);
    const text = await res.text();
    const hash = await sha256(text);

    const { data: state } = await supabase.from('sheet_sync_state').select('last_hash').eq('id', 'orders').maybeSingle();
    if (!force && state?.last_hash === hash) return json({ skipped: 'unchanged' });

    // ---- parse ----
    const table = parseCsv(text);
    const headerIdx = table.findIndex((r) => r.includes('Client'));
    if (headerIdx === -1) throw new Error('No "Client" column in the sheet');
    const header = table[headerIdx];
    const col = {
      name: header.indexOf('Client'),
      restaurant: header.indexOf('restorant'),
      dish: header.indexOf('desc'),
      price: header.indexOf('price'),
      discPrice: header.indexOf('disc_price'),
      quantity: header.indexOf('quant'),
    };

    const groups = new Map<string, { name: string; restaurantId: string; items: Item[] }>();
    const unmapped = new Set<string>();
    for (const r of table.slice(headerIdx + 1)) {
      const name = (r[col.name] || '').trim();
      const dish = (r[col.dish] || '').trim();
      const quantity = parseInt(r[col.quantity], 10);
      if (!name || !dish || !quantity) continue;
      const date = r.map(parseSheetDate).find(Boolean) ?? null;
      if (date !== now.date) continue; // today only
      const restaurantRaw = (r[col.restaurant] || '').trim();
      const restaurantId = mapRestaurant(restaurantRaw);
      if (!restaurantId) { unmapped.add(restaurantRaw || '(empty)'); continue; }
      const price = parseFloat(r[col.discPrice]) || parseFloat(r[col.price]) || 0;
      const key = `${name.toLowerCase()}|${restaurantId}`;
      if (!groups.has(key)) groups.set(key, { name, restaurantId, items: [] });
      groups.get(key)!.items.push({ name: dish, price, quantity });
    }

    // ---- sync ----
    const { data: restaurants } = await supabase.from('restaurants').select('id, name');
    const restaurantName = Object.fromEntries((restaurants || []).map((x: any) => [x.id, x.name]));

    const userCache = new Map<string, { id: string }>();
    async function findOrCreateUser(name: string) {
      const key = name.toLowerCase();
      if (userCache.has(key)) return userCache.get(key)!;
      const { data: existing } = await supabase.from('users').select('id').ilike('name', name).limit(1).maybeSingle();
      let user = existing;
      if (!user) {
        const { data: created, error } = await supabase.from('users').insert({ name }).select('id').single();
        if (error) throw new Error(error.message);
        user = created;
      }
      userCache.set(key, user!);
      return user!;
    }

    let created = 0, updated = 0, unchanged = 0;
    const touched: string[] = [];
    const skippedForColleagues: string[] = [];

    for (const g of groups.values()) {
      const user = await findOrCreateUser(g.name);
      const total = g.items.reduce((s, i) => s + i.price * i.quantity, 0);

      const { data: existing } = await supabase
        .from('orders')
        .select('id, order_items(item_name, price, quantity, is_paid, for_name)')
        .eq('user_id', user.id)
        .eq('restaurant_id', g.restaurantId)
        .eq('order_date', now.date)
        .maybeSingle();

      let orderId = existing?.id as string | undefined;
      const paidByDish = new Map<string, boolean>();

      if (existing) {
        const oldItems = (existing.order_items || []).map((i: any) => ({
          name: i.item_name, price: Number(i.price), quantity: i.quantity,
        }));
        if (signature(oldItems) === signature(g.items)) { unchanged++; continue; }
        // Placed in the app with dishes for colleagues — the sheet doesn't
        // know about those lines, so rewriting would lose them. Leave it.
        if ((existing.order_items || []).some((i: any) => i.for_name)) {
          skippedForColleagues.push(`${g.name} @ ${g.restaurantId}`);
          continue;
        }
        for (const i of existing.order_items || []) {
          if (i.is_paid) paidByDish.set(String(i.item_name).trim().toLowerCase(), true);
        }
        const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', orderId);
        if (delErr) throw new Error(delErr.message);
        const { error } = await supabase.from('orders').update({ total }).eq('id', orderId);
        if (error) throw new Error(error.message);
        updated++;
      } else {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({
            user_id: user.id,
            order_date: now.date,
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

      const { error: itemsErr } = await supabase.from('order_items').insert(
        g.items.map((i) => ({
          order_id: orderId,
          item_name: i.name,
          price: i.price,
          quantity: i.quantity,
          line_total: i.price * i.quantity,
          is_paid: paidByDish.get(i.name.trim().toLowerCase()) ?? false,
        }))
      );
      if (itemsErr) throw new Error(itemsErr.message);
      touched.push(`${g.name} @ ${g.restaurantId}`);
    }

    const result = { date: now.date, created, updated, unchanged, touched, skippedForColleagues, unmapped: [...unmapped] };
    await supabase.from('sheet_sync_state').upsert({
      id: 'orders', last_hash: hash, last_run_at: new Date().toISOString(), last_result: result,
    });
    return json(result);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
