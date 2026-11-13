// Relays push messages to Expo's push API server-side.
//
// The web app can't call https://exp.host/--/api/v2/push/send directly —
// Expo's push endpoint doesn't send CORS headers, so browsers block the
// request outright (this doesn't affect the native app; CORS is a
// browser-only restriction). This function runs outside a browser, so it
// isn't subject to CORS, and it sends its own permissive CORS headers so
// the web app can call *it* instead.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-import-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const messages = await req.json();
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
