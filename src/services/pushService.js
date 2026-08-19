import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';

const PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId;

// Expo's push endpoint sends no CORS headers, so a browser blocks calling it
// directly (native isn't affected — CORS is browser-only). This Edge
// Function relays the request server-side instead. See
// supabase/functions/send-push/index.ts.
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`;

// Ask for permission and store this device's push token against the
// logged-in user. Silently gives up on simulators/web or if denied —
// push notifications are a nice-to-have, never block the app on them.
export async function registerForPushNotifications(user) {
  if (!isSupabaseConfigured || !user || Platform.OS === 'web' || !Device.isDevice) return;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (!token) return;

    await supabase
      .from('push_tokens')
      .upsert({ user_id: user.id, token }, { onConflict: 'token' });
  } catch (_) {
    // Non-fatal: ordering/menu browsing must keep working either way.
  }
}

// "Кебапче x2, Шопска салата" — capped so it can't blow up into an essay
// for a big order; the OS truncates the notification anyway.
function summarizeCart(cart) {
  const parts = (cart || []).map((i) => (i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name));
  if (parts.length > 4) {
    return `${parts.slice(0, 4).join(', ')} и още ${parts.length - 4}`;
  }
  return parts.join(', ');
}

// Notify everyone else's devices that a new order was placed.
export async function notifyOrderPlaced(orderingUser, restaurantName, cart, total) {
  if (!isSupabaseConfigured) return;
  try {
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .neq('user_id', orderingUser.id);
    if (!tokens?.length) return;

    const items = summarizeCart(cart);
    const totalText = typeof total === 'number' ? ` — ${total.toFixed(2)} €` : '';
    const body = `${orderingUser.name} поръча от ${restaurantName || 'менюто'}: ${items}${totalText}`;

    const messages = tokens.map((t) => ({
      to: t.token,
      title: '🍽️ Нова поръчка',
      body,
      sound: 'default',
    }));

    await fetch(SEND_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(messages),
    });
  } catch (_) {
    // Best-effort — a failed notification must never block/fail the order.
  }
}
