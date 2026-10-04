import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';
import { firstNameOf } from '../utils/text';

const webClientId = Constants.expoConfig?.extra?.googleWebClientId;

// Where Supabase sends the native (Android/iOS) OAuth browser flow back to.
// Must be listed under Supabase → Authentication → URL Configuration →
// Redirect URLs (see README.md).
const NATIVE_REDIRECT = 'lunchhub://auth-callback';

// Which provider this session was just signed in with. Supabase links
// identities that share a verified email onto one auth user, so
// app_metadata.provider only says which one came *first* — the identity with
// the latest last_sign_in_at is the one actually used this time.
function currentProvider(user) {
  const identities = user?.identities || [];
  if (identities.length === 0) return user?.app_metadata?.provider || null;
  const latest = identities.reduce((a, b) =>
    new Date(b.last_sign_in_at || 0) > new Date(a.last_sign_in_at || 0) ? b : a
  );
  return latest.provider;
}

function extractProfile(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  // Prefer the first name alone: name-only login asks for just a first name
  // (see LoginScreen's "напр. Иван" placeholder), and matching against it is
  // one of the ways a social sign-in links back to that same users row (see
  // upsertUserFromSocial). Falling back to the full name here would create a
  // second, unlinked row for the same person the first time they sign in.
  // Facebook has no given_name, so its full name is trimmed to the first word.
  const name =
    meta.given_name ||
    firstNameOf(meta.full_name || meta.name) ||
    user.email?.split('@')[0] ||
    'Потребител';
  const avatarUrl = meta.avatar_url || meta.picture || null;
  // Supabase Auth's own id for this identity — stable forever, and the
  // primary (script/spelling-independent) way upsertUserFromSocial
  // recognizes a returning sign-in.
  const authUserId = user.id;
  const provider = currentProvider(user);
  return { name, avatarUrl, authUserId, provider };
}

// Native (Android/iOS): the Google Sign-In SDK gives us an idToken, which
// Supabase verifies directly — no browser redirect needed.
// Web: no native SDK exists, so we fall back to Supabase's own OAuth
// redirect flow (bounces to Google's consent page and back); the profile
// is picked up afterwards via supabase.auth.onAuthStateChange.
export async function signInWithGoogle() {
  if (Platform.OS === 'web') return signInWithWebRedirect('google');

  if (!webClientId) {
    throw new Error('Липсва googleWebClientId в app.json — виж README.md.');
  }

  const { GoogleSignin, isSuccessResponse, isCancelledResponse } = require('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId, offlineAccess: false });

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (isCancelledResponse(response)) return null; // user closed the dialog — not an error
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google не върна валиден вход.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.data.idToken,
  });
  if (error) throw new Error(error.message);
  return extractProfile(data.user);
}

// Facebook's Android SDK only hands out an access token (no OIDC idToken
// like Google's), which Supabase can't verify directly — so native goes
// through Supabase's OAuth flow too, just in an in-app browser tab that
// redirects back to the app's lunchhub:// scheme instead of a web origin.
export async function signInWithFacebook() {
  if (Platform.OS === 'web') return signInWithWebRedirect('facebook');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);

  const WebBrowser = require('expo-web-browser');
  const result = await WebBrowser.openAuthSessionAsync(data.url, NATIVE_REDIRECT);
  if (result.type !== 'success') return null; // user closed the tab — not an error

  const user = await sessionFromRedirect(result.url);
  return extractProfile(user);
}

async function signInWithWebRedirect(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
  return null; // the browser navigates away; session is picked up on return
}

// The redirect back carries either a PKCE ?code= or implicit-flow
// #access_token=… depending on the client's flowType — handle both.
async function sessionFromRedirect(url) {
  const [beforeHash, hash = ''] = url.split('#');
  const query = new URLSearchParams(beforeHash.split('?')[1] || '');
  const fragment = new URLSearchParams(hash);

  const errorDescription = query.get('error_description') || fragment.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  const code = query.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    return data.user;
  }

  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('Facebook не върна валиден вход.');
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw new Error(error.message);
  return data.user;
}

export async function signOutSocial() {
  if (Platform.OS !== 'web') {
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {
      // Best-effort — clearing our own local session below is what matters.
    }
  }
  await supabase.auth.signOut();
}

// Used by AuthContext's onAuthStateChange listener to finish the web
// redirect flow, where signInWithGoogle/Facebook() above return null
// immediately.
export function extractProfileFromSession(session) {
  return extractProfile(session?.user);
}
