import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured } from '../config/supabase';

const PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId;

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

// Notify everyone else's devices that a new order was placed.
export async function notifyOrderPlaced(orderingUser, restaurantName) {
  if (!isSupabaseConfigured) return;
  try {
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .neq('user_id', orderingUser.id);
    if (!tokens?.length) return;

    const messages = tokens.map((t) => ({
      to: t.token,
      title: '🍽️ Нова поръчка',
      body: `${orderingUser.name} поръча от ${restaurantName || 'менюто'}`,
      sound: 'default',
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (_) {
    // Best-effort — a failed notification must never block/fail the order.
  }
}
