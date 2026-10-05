// Native (Android/iOS) Facebook sign-in → Supabase session.
//
// Google's native SDK hands the app an OIDC idToken that Supabase verifies
// itself (signInWithIdToken). Facebook's Android SDK only gives a plain
// access token, which Supabase can't verify — so this function does it:
//   1. checks the token really belongs to *our* Facebook app (debug_token),
//   2. reads the person's profile (name, first name, email, photo),
//   3. finds or creates the Supabase Auth user for them, keyed by email —
//      the same email Supabase's own Facebook OAuth (used on web) would
//      key on, so web and native land on the same auth user,
//   4. returns a one-time magic-link token_hash, which the app exchanges
//      for a normal session via supabase.auth.verifyOtp.
// Nothing is emailed: generateLink only mints the token.
//
// Secrets: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET (supabase secrets set …).
// Deployed with --no-verify-jwt — the caller isn't signed in yet; the
// Facebook token itself is what gets verified.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const appId = Deno.env.get('FACEBOOK_APP_ID');
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
    if (!appId || !appSecret) return json({ error: 'Facebook не е настроен на сървъра.' }, 500);

    const { accessToken } = await req.json();
    if (!accessToken) return json({ error: 'Липсва Facebook токен.' }, 400);

    const debugRes = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}` +
        `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
    );
    const debug = (await debugRes.json())?.data;
    if (!debug?.is_valid || String(debug.app_id) !== appId) {
      return json({ error: 'Невалиден Facebook вход.' }, 401);
    }

    const meRes = await fetch(
      `${GRAPH}/me?fields=id,name,first_name,email,picture.width(256).height(256)` +
        `&access_token=${encodeURIComponent(accessToken)}`
    );
    const me = await meRes.json();
    if (!meRes.ok || !me?.id || String(me.id) !== String(debug.user_id)) {
      return json({ error: 'Facebook не върна профил.' }, 401);
    }

    // A Facebook account can exist without an email (phone-only signup);
    // fall back to a stable per-Facebook-id address that's never mailed.
    const email = (me.email || `fb-${me.id}@lunchhub.expo.app`).toLowerCase();
    const metadata = {
      full_name: me.name,
      name: me.name,
      given_name: me.first_name,
      avatar_url: me.picture?.data?.is_silhouette ? null : me.picture?.data?.url ?? null,
      facebook_id: me.id,
    };

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (createErr && !/already|exists|registered/i.test(createErr.message)) {
      return json({ error: createErr.message }, 500);
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: linkErr?.message || 'Неуспешно създаване на сесия.' }, 500);
    }

    // Keep name/photo fresh for returning users (createUser only set them
    // the first time).
    await admin.auth.admin.updateUserById(link.user.id, { user_metadata: metadata });

    return json({ token_hash: link.properties.hashed_token });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
