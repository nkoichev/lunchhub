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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
