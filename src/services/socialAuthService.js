import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';
import { firstNameOf } from '../utils/text';

const webClientId = Constants.expoConfig?.extra?.googleWebClientId;

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

// `provider` overrides the session's own — the native Facebook flow ends in
// a magic-link session (see signInWithFacebook), whose identity is 'email'.
function extractProfile(user, provider = currentProvider(user)) {
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

// Native: the Facebook SDK signs in through the installed Facebook app (one
// tap, like Google), but on Android it only hands out a plain access token —
// no OIDC idToken that Supabase could verify itself. The facebook-login Edge
// Function verifies it with Facebook instead and returns a one-time token
// that's exchanged here for a normal Supabase session.
// Web: Supabase's own OAuth redirect flow, same as Google.
export async function signInWithFacebook() {
  if (Platform.OS === 'web') return signInWithWebRedirect('facebook');

  const { LoginManager, AccessToken, Settings } = require('react-native-fbsdk-next');
  Settings.initializeSDK();
  // Fresh start each time, so switching Facebook accounts works.
  LoginManager.logOut();

  const result = await LoginManager.logInWithPermissions(['public_profile', 'email']);
  if (result.isCancelled) return null; // user closed the dialog — not an error

  const token = await AccessToken.getCurrentAccessToken();
  if (!token?.accessToken) throw new Error('Facebook не върна валиден вход.');

  const { data, error } = await supabase.functions.invoke('facebook-login', {
    body: { accessToken: token.accessToken },
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }

  const { data: verified, error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: 'magiclink',
  });
  if (otpErr) throw new Error(otpErr.message);
  return extractProfile(verified.user, 'facebook');
}

async function signInWithWebRedirect(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
  return null; // the browser navigates away; session is picked up on return
}

export async function signOutSocial() {
  if (Platform.OS !== 'web') {
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {
      // Best-effort — clearing our own local session below is what matters.
    }
    try {
      const { LoginManager } = require('react-native-fbsdk-next');
      LoginManager.logOut();
    } catch {
      // Same — best-effort.
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
