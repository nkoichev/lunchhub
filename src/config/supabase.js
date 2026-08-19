import 'react-native-url-polyfill/auto';
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

// Shared team access codes (see app.json -> expo.extra.accessPins). Gates
// the app before login — a soft deterrent against a stranger who stumbles
// on the install link, not a real security boundary (the anon key above is
// already open to anyone who has it, same as it is without this gate).
// Any code in the list works, so an old one can keep working alongside a
// newer one instead of invalidating it.
export const ACCESS_PINS = extra.accessPins ?? [];

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
      detectSessionInUrl: false,
    },
  }
);
