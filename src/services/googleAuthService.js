import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';

const webClientId = Constants.expoConfig?.extra?.googleWebClientId;

function extractProfile(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  // Prefer the first name alone: name-only login asks for just a first name
  // (see LoginScreen's "напр. Иван" placeholder), and matching against it is
  // how a Google sign-in links back to that same users row (see
  // upsertUserFromGoogle). Falling back to the full name here would create a
  // second, unlinked row for the same person the first time they try Google.
  const name =
    meta.given_name || meta.full_name || meta.name || user.email?.split('@')[0] || 'Потребител';
  const avatarUrl = meta.avatar_url || meta.picture || null;
  return { name, avatarUrl };
}

// Native (Android/iOS): the Google Sign-In SDK gives us an idToken, which
// Supabase verifies directly — no browser redirect needed.
// Web: no native SDK exists, so we fall back to Supabase's own OAuth
// redirect flow (bounces to Google's consent page and back); the profile
// is picked up afterwards via supabase.auth.onAuthStateChange.
export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
    return null; // the browser navigates away; session is picked up on return
  }

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

export async function signOutGoogle() {
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
// redirect flow, where signInWithGoogle() above returns null immediately.
export function extractProfileFromSession(session) {
  return extractProfile(session?.user);
}
