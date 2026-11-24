import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Read credentials from app.json -> expo.extra (see README).
const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};

const rawUrl = extra.supabaseUrl ?? '';
const rawKey = extra.supabaseAnonKey ?? '';

// A value is "real" only if it looks like a proper URL / key — not a leftover
// placeholder like "YOUR_SUPABASE_URL_HERE".
export const isSupabaseConfigured =
  /^https?:\/\//.test(rawUrl) && rawKey.length > 20 && !rawKey.includes('YOUR_');

export const SUPABASE_URL = rawUrl;
export const SUPABASE_ANON_KEY = rawKey;

// IMPORTANT: never pass an invalid URL to createClient — it throws at import
// time and crashes the whole app ("runtime not ready"). When not configured,
// fall back to a valid dummy URL so the app boots in demo mode instead.
export const supabase = createClient(
  isSupabaseConfigured ? rawUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? rawKey : 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Only web needs this: it's how the client picks up the session after
      // Google's OAuth redirect bounces back with the token in the URL.
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);

// Headers for calling our Edge Functions as the signed-in person: the
// functions check that the token belongs to someone on the LunchHub list.
export async function functionHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    apikey: rawKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
