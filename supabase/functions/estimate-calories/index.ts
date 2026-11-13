// Rough calorie estimate for a dish name, via the Gemini API.
//
// The key lives here, not in the app bundle: unlike the Supabase anon key
// (meant to be public, scoped by RLS), a bare Gemini API key has no such
// scoping — anyone who extracted it from the client could spend the whole
// free quota. Same reasoning as send-push relaying Expo's push API.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-import-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
// flash-lite instead of full flash: much higher free-tier daily quota, and
// this task (a rough calorie guess from a dish name) doesn't need the
// bigger model's reasoning power.
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`;

// Only signed-in LunchHub members (a session whose confirmed email is on
// public.allowed_emails, checked by the is_member() RPC) or our own scripts
// (x-import-secret = IMPORT_SECRET) may call this — the publishable key alone
// is public, so it's not enough.
async function isAllowed(req: Request): Promise<boolean> {
  const secret = Deno.env.get('IMPORT_SECRET');
  if (secret && req.headers.get('x-import-secret') === secret) return true;
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.length < 40) return false;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/is_member`, {
    method: 'POST',
    headers: {
      apikey: req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return res.ok && (await res.json()) === true;
}

function forbidden(cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: 'Not a LunchHub member' }), {
    status: 401,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (!(await isAllowed(req))) return forbidden(corsHeaders);

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
