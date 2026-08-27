// Imports "Щастливеца"'s daily lunch menu from an emailed menu image.
//
// A Google Apps Script watches Gmail for the restaurant's newsletter,
// grabs the image URL for that day's menu, and POSTs it here. This
// function reads the image with Gemini vision (same key/model family as
// estimate-calories) to extract dish names/prices/categories/calories in
// one call, then overwrites today's menu_items rows for this restaurant.
//
// IMPORT_SECRET guards against randoms hitting this endpoint and burning
// the Gemini free quota — the anon key alone doesn't gate it, since it's
// already public in the app bundle by design (RLS allows anon full access).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-import-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESTAURANT_ID = 'shtastlivetsa';

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
// flash-lite instead of full flash: much higher free-tier daily quota and
// availability (same reasoning as estimate-calories), and this task doesn't
// need the bigger model's reasoning power.
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`;
const IMPORT_SECRET = Deno.env.get('IMPORT_SECRET');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function mimeTypeFor(url: string) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpeg' || ext === 'jpg') return 'image/jpeg';
  return 'image/jpeg';
}

// Europe/Sofia weekday, matching menu_items.day_index (1=Mon..5=Fri).
function sofiaDayIndex(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Sofia', weekday: 'short' })
    .formatToParts(new Date());
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[weekday] ?? 0;
}

// Best-effort push to every registered device once the day's menu is in —
// mirrors notifyOrderPlaced in src/services/pushService.js, but server-side
// (no client is involved in this import), so it hits Expo's push API
// directly instead of going through the send-push relay (that relay only
// exists to work around browser CORS, which doesn't apply here).
// deno-lint-ignore no-explicit-any
async function notifyMenuUploaded(supabase: any) {
  try {
    const { data: tokens } = await supabase.from('push_tokens').select('token');
    if (!tokens?.length) return;

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: '🍽️ Ново меню от Щастливеца',
      body: 'Днешното обедно меню вече е в приложението.',
      sound: 'default',
    }));

    // Expo caps batches at 100 messages per request.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
    if (!IMPORT_SECRET) throw new Error('IMPORT_SECRET not configured');
    if (req.headers.get('x-import-secret') !== IMPORT_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageUrl } = await req.json();
    if (!(imageUrl || '').trim()) throw new Error('Missing imageUrl');

    const dayIndex = sofiaDayIndex();
    if (dayIndex < 1 || dayIndex > 5) {
      return new Response(JSON.stringify({ skipped: true, reason: 'weekend', dayIndex }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch menu image: ${imgRes.status}`);
    const imgBuf = await imgRes.arrayBuffer();
    const imgBytes = new Uint8Array(imgBuf);
    // Spreading the whole array into String.fromCharCode blows the call
    // stack on real photo-sized images — build the binary string in chunks.
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < imgBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...imgBytes.subarray(i, i + chunkSize));
    }
    const imgBase64 = btoa(binary);

    const prompt = `This image is a Bulgarian restaurant's daily lunch menu (обедно меню). Extract every priced menu item.
Rules:
- Ignore allergen codes like /1,3,7,9,10/ and weight/portion labels like "300 г".
- If a line is a supplement/add-on to the dish above it (e.g. "- добавка сирене 50 г"), name it "<parent dish> - <add-on>".
- category must be one of: soup, salad, main, drink, dessert.
- price is the number in euro (ignore the € sign), as shown.
- calories: your best rough ballpark estimate (kcal) for one typical serving of the dish, same as you'd give if asked directly for a calorie estimate. Supplements/drinks can be null.
Return every item, in the order they appear.`;

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeTypeFor(imageUrl), data: imgBase64 } },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                price: { type: 'NUMBER' },
                category: { type: 'STRING' },
                calories: { type: 'INTEGER', nullable: true },
              },
              required: ['name', 'price', 'category'],
            },
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`Gemini responded ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const items = JSON.parse(text ?? '[]');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Gemini returned no menu items');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service credentials not configured');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    await supabase.from('restaurants').upsert({ id: RESTAURANT_ID, name: 'Щастливеца' });

    const { error: deleteError } = await supabase
      .from('menu_items')
      .delete()
      .eq('restaurant_id', RESTAURANT_ID)
      .eq('day_index', dayIndex);
    if (deleteError) throw new Error(deleteError.message);

    const rows = items.map((it: { name: string; price: number; category: string; calories: number | null }) => ({
      restaurant_id: RESTAURANT_ID,
      day_index: dayIndex,
      name: it.name,
      price: it.price,
      category: it.category,
      calories: it.calories ?? null,
    }));

    const { error: insertError } = await supabase.from('menu_items').insert(rows);
    if (insertError) throw new Error(insertError.message);

    await notifyMenuUploaded(supabase);

    return new Response(JSON.stringify({ dayIndex, inserted: rows.length, items: rows.map((r) => r.name) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
