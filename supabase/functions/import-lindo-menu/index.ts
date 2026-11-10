// Imports Lindo's lunch menu straight from https://lindo.bg/menu/daily.
//
// The page (Next.js, server-rendered) has two parts:
//   - "Седмично обедно": this week's daily specials, one section per date.
//     Lindo publishes them day by day, so later days may still be missing
//     in the morning — every run re-imports whatever dates are up.
//   - "Всекидневно обедно": the fixed everyday lunch menu (salads, soups,
//     omelettes, pizzas, desserts...) → stored as day_index 0, which the
//     app shows on every weekday.
//
// Rather than scraping the rendered HTML, it reads the structured props
// Next.js embeds for the DayMenuView component (self.__next_f payload),
// which has names, prices, portion sizes and out-of-stock flags as JSON.
//
// Runs from pg_cron a few times each weekday morning (see
// supabase/migration_lindo.sql). Idempotent: a day whose dishes didn't
// change only gets its updated_at bumped (ids stay stable); a changed day
// is deleted + re-inserted, same as the Щастливеца import. Categories and
// calories are carried over from existing rows by dish name, so Gemini is
// only asked about dishes it has never seen before.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESTAURANT_ID = 'lindo';
const RESTAURANT_NAME = 'Lindo';
const MENU_URL = 'https://lindo.bg/menu/daily';

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CATEGORIES = new Set(['soup', 'salad', 'main', 'dessert', 'side']);

type Line = {
  name: string;
  price: string | number;
  isOutOfStock?: boolean;
  choices?: unknown[];
};
type Section = { id: string; title: string; lines?: Line[] };
type Dish = { name: string; price: number; category: string | null; calories: number | null };

// Everyday section title → app category. Anything not listed is a main.
// null = don't import (drinks aren't part of the lunch order).
function categoryForSection(title: string): string | null {
  const t = title.trim().toLowerCase();
  if (t.startsWith('салат')) return 'salad';
  if (t.startsWith('суп')) return 'soup';
  if (t.startsWith('десерт')) return 'dessert';
  if (t.startsWith('хляб')) return 'side';
  if (t.startsWith('напитк')) return null;
  return 'main';
}

// Fallback when Gemini is unavailable: the weekly specials have no
// category on the site, so guess from the name.
function guessCategory(name: string): string {
  const n = name.toLowerCase();
  if (/(супа|чорба|таратор|бульон)/.test(n)) return 'soup';
  if (/^салата/.test(n)) return 'salad';
  if (/(тиквеник|крем карамел|торта|мляко с ориз|палачинк|сладолед|баклава|пудинг|мус\b|чийзкейк|с мед|сладк|макарони на фурна|кекс|щрудел)/.test(n)) return 'dessert';
  return 'main';
}

// Today in Europe/Sofia as YYYY-MM-DD.
function sofiaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date());
}

// YYYY-MM-DD → day_index (1=Mon..7=Sun). Date-only strings parse as UTC.
function dayIndexOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// Pull the DayMenuView props out of the Next.js flight payload.
function extractMenuProps(html: string) {
  let flight = '';
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html))) flight += JSON.parse(`"${m[1]}"`);

  const start = flight.indexOf('{"weeklyTitle"');
  if (start < 0) throw new Error('Lindo page format changed: DayMenuView props not found');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      return JSON.parse(flight.slice(start, i + 1)) as {
        weeklySections?: Section[];
        dailySections?: Section[];
      };
    }
  }
  throw new Error('Lindo page format changed: unterminated DayMenuView props');
}

function toDishes(lines: Line[] | undefined, category: string | null): Dish[] {
  const seen = new Set<string>();
  const out: Dish[] = [];
  for (const l of lines ?? []) {
    const name = (l.name ?? '').replace(/\s+/g, ' ').trim();
    const price = Number(l.price);
    // "Пица по избор" (a pick-any-pizza line) duplicates the everyday
    // Пици section, where each pizza is its own orderable dish.
    if (!name || l.isOutOfStock || (l.choices && l.choices.length) || !Number.isFinite(price)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, price, category, calories: null });
  }
  return out;
}

// One Gemini call for every dish we have no category/calories for yet.
async function enrich(dishes: Dish[]): Promise<void> {
  if (!dishes.length) return;
  const fallback = () => dishes.forEach((d) => { d.category ??= guessCategory(d.name); });
  if (!GEMINI_KEY) return fallback();

  const prompt = `These are dishes from a Bulgarian restaurant's lunch menu (обедно меню).
For each, return:
- category: one of soup, salad, main, dessert, side. If a category hint is given, use it.
- calories: your best rough ballpark estimate (kcal) for one typical serving, same as you'd give if asked directly. null for bread/add-ons if unsure.
Return one entry per input dish, same order, with the name copied exactly.
Dishes:
${dishes.map((d) => `- ${d.name}${d.category ? ` [category hint: ${d.category}]` : ''}`).join('\n')}`;

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                category: { type: 'STRING' },
                calories: { type: 'INTEGER', nullable: true },
              },
              required: ['name', 'category'],
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini responded ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const out = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]');
    const byName = new Map<string, { category?: string; calories?: number | null }>();
    for (const o of Array.isArray(out) ? out : []) byName.set(String(o.name).trim(), o);
    dishes.forEach((d, i) => {
      const o = byName.get(d.name) ?? out[i];
      if (!d.category && o && CATEGORIES.has(o.category)) d.category = o.category;
      if (o && Number.isFinite(o.calories)) d.calories = o.calories;
    });
  } catch (e) {
    console.error('[import-lindo-menu] Gemini enrich failed', e);
  }
  fallback();
}

// deno-lint-ignore no-explicit-any
async function notifyMenuUploaded(supabase: any) {
  try {
    const { data: tokens } = await supabase.from('push_tokens').select('token');
    if (!tokens?.length) return;
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: '🍽️ Ново меню от Lindo',
      body: 'Днешното обедно меню вече е в приложението.',
      sound: 'default',
    }));
    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    }
  } catch (_e) {
    // Never fail the menu import over a notification hiccup.
  }
}

const signature = (rows: { name: string; price: number | string }[]) =>
  rows.map((r) => `${r.name}|${Number(r.price).toFixed(2)}`).sort().join('\n');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service credentials not configured');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const pageRes = await fetch(MENU_URL, {
      headers: { 'User-Agent': 'LunchHub menu import', 'Accept-Language': 'bg' },
    });
    if (!pageRes.ok) throw new Error(`Failed to fetch ${MENU_URL}: ${pageRes.status}`);
    const props = extractMenuProps(await pageRes.text());

    // day_index → dishes to store.
    const days = new Map<number, Dish[]>();

    const today = sofiaToday();
    for (const s of props.weeklySections ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.id)) continue;
      // Only today and the days still ahead — never overwrite a past day
      // with next week's menu, and leave past days as they were.
      const ahead = daysBetween(today, s.id);
      if (ahead < 0 || ahead > 6) continue;
      const idx = dayIndexOf(s.id);
      if (idx > 5) continue;
      const dishes = toDishes(s.lines, null);
      if (dishes.length) days.set(idx, dishes);
    }

    const everyday: Dish[] = [];
    for (const s of props.dailySections ?? []) {
      const cat = categoryForSection(s.title ?? '');
      if (cat) everyday.push(...toDishes(s.lines, cat));
    }
    // Guard against wiping the everyday menu on a half-loaded page.
    if (everyday.length) days.set(0, everyday.filter((d, i, a) => a.findIndex((x) => x.name === d.name) === i));

    if (!days.size) throw new Error('Lindo page had no dishes');

    await supabase.from('restaurants').upsert({ id: RESTAURANT_ID, name: RESTAURANT_NAME });

    const { data: existing, error: exErr } = await supabase
      .from('menu_items')
      .select('day_index, name, price, category, calories, updated_at')
      .eq('restaurant_id', RESTAURANT_ID);
    if (exErr) throw new Error(exErr.message);

    // Carry over category/calories by name; collect the unknowns.
    const known = new Map<string, { category: string | null; calories: number | null }>();
    for (const r of existing ?? []) {
      const k = known.get(r.name);
      if (!k || (k.calories == null && r.calories != null)) known.set(r.name, { category: r.category, calories: r.calories });
    }
    const unknown: Dish[] = [];
    for (const dishes of days.values()) {
      for (const d of dishes) {
        const k = known.get(d.name);
        if (k && (k.calories != null || d.category === 'side')) {
          d.category ??= k.category;
          d.calories = k.calories;
        } else unknown.push(d);
      }
    }
    // The same new dish can appear on several days — ask once, copy back.
    const uniq = new Map<string, Dish>();
    for (const d of unknown) if (!uniq.has(d.name)) uniq.set(d.name, { ...d });
    await enrich([...uniq.values()]);
    for (const d of unknown) {
      const e = uniq.get(d.name)!;
      d.category ??= e.category;
      d.calories ??= e.calories;
    }

    const summary: Record<string, { action: string; count: number }> = {};
    let todayChanged = false;
    const now = new Date().toISOString();

    const todayIdx = dayIndexOf(today);
    const sofiaDate = (iso: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date(iso));

    for (const [idx, dishes] of days) {
      const old = (existing ?? []).filter((r) => r.day_index === idx);
      // Future days are usually imported days in advance, so on the morning
      // itself nothing "changes" — still announce it on the first run today.
      if (idx === todayIdx && !old.some((r) => r.updated_at && sofiaDate(r.updated_at) === today)) {
        todayChanged = true;
      }
      if (old.length && signature(old) === signature(dishes)) {
        const { error } = await supabase
          .from('menu_items')
          .update({ updated_at: now })
          .eq('restaurant_id', RESTAURANT_ID)
          .eq('day_index', idx);
        if (error) throw new Error(error.message);
        summary[idx] = { action: 'unchanged', count: dishes.length };
        continue;
      }

      const { error: delErr } = await supabase
        .from('menu_items')
        .delete()
        .eq('restaurant_id', RESTAURANT_ID)
        .eq('day_index', idx);
      if (delErr) throw new Error(delErr.message);

      const rows = dishes.map((d) => ({
        restaurant_id: RESTAURANT_ID,
        day_index: idx,
        name: d.name,
        price: d.price,
        category: d.category ?? 'main',
        calories: d.calories,
      }));
      const { error: insErr } = await supabase.from('menu_items').insert(rows);
      if (insErr) throw new Error(insErr.message);
      summary[idx] = { action: 'replaced', count: rows.length };
      if (idx === todayIdx) todayChanged = true;
    }

    if (todayChanged) await notifyMenuUploaded(supabase);

    return new Response(JSON.stringify({ today, days: summary, enriched: uniq.size, notified: todayChanged }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[import-lindo-menu]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
