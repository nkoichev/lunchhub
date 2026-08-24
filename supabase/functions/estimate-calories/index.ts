// Rough calorie estimate for a dish name, via the Gemini API.
//
// The key lives here, not in the app bundle: unlike the Supabase anon key
// (meant to be public, scoped by RLS), a bare Gemini API key has no such
// scoping — anyone who extracted it from the client could spend the whole
// free quota. Same reasoning as send-push relaying Expo's push API.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');

    const { name, category } = await req.json();
    if (!(name || '').trim()) throw new Error('Missing dish name');

    const prompt = `Estimate the approximate calories (kcal) for ONE typical restaurant serving of this Bulgarian lunch dish. This is a rough, ballpark estimate — no explanation needed.
Dish: "${name}"${category ? ` (category: ${category})` : ''}`;

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { calories: { type: 'INTEGER' } },
            required: ['calories'],
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`Gemini responded ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text ?? '{}');
    const calories = Number.isFinite(parsed.calories) ? Math.round(parsed.calories) : null;

    return new Response(JSON.stringify({ calories }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
