import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured, SUPABASE_URL, functionHeaders } from '../config/supabase';

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

// Relays a batch of Expo push messages through the send-push function.
async function relay(messages) {
  if (!messages.length) return;
  await fetch(SEND_PUSH_URL, {
    method: 'POST',
    // send-push only accepts signed-in LunchHub members (see the function).
    headers: { ...(await functionHeaders()), Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

// Best-effort push to a set of users (or everyone but `exceptUserId` when
// `userIds` is omitted). Never throws — a notification hiccup must not fail
// whatever action triggered it.
export async function pushTo({ userIds, exceptUserId, title, body, data }) {
  if (!isSupabaseConfigured) return;
  try {
    let q = supabase.from('push_tokens').select('token, user_id');
    if (userIds) q = q.in('user_id', userIds);
    if (exceptUserId) q = q.neq('user_id', exceptUserId);
    const { data: tokens } = await q;
    if (!tokens?.length) return;
    await relay(tokens.map((t) => ({ to: t.token, title, body, sound: 'default', data })));
  } catch (_) {}
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A little variety so "new order" pushes don't all read the same.
function orderTitle(cart) {
  const qty = (cart || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const names = (cart || []).map((i) => i.name.toLowerCase()).join(' ');
  if (/баклав|торт|десерт|палачинк|сладолед|тирамису|крем карамел/.test(names)) {
    return pick(['🍰 Някой си угажда днес', '🍫 Сладко изкушение в поръчките']);
  }
  if (qty >= 4) return pick(['👀 Някой е много гладен', '🐻 Апетит на мечка']);
  return pick(['🍽️ Нова поръчка', '😋 Още един гладник', '🛎️ Поръчката тръгна', '🍲 Някой вече избра']);
}

// Notify everyone else's devices that a new order was placed.
export async function notifyOrderPlaced(orderingUser, restaurantName, cart, total) {
  const items = summarizeCart(cart);
  const totalText = typeof total === 'number' ? ` — ${total.toFixed(2)} €` : '';
  await pushTo({
    exceptUserId: orderingUser.id,
    title: orderTitle(cart),
    body: `${orderingUser.name} току-що поръча от ${restaurantName || 'менюто'}: ${items}${totalText}`,
    data: { screen: 'Today' },
  });
}

// Roulette result — everyone gets told who's buying.
export async function notifyRouletteWinner(spinner, winnerName) {
  await pushTo({
    title: `🎰 Рулетката реши: днес сметката я плаща ${winnerName}!`,
    body: `${spinner.name} завъртя колелото. Останалите си връщате дела по Revolut 💸`,
    data: { screen: 'Today' },
  });
}

// Someone reacted to your order.
export async function notifyReaction(reactor, ownerUserId, emoji) {
  if (!ownerUserId || ownerUserId === reactor.id) return;
  await pushTo({
    userIds: [ownerUserId],
    title: `${emoji} ${reactor.name} реагира на поръчката ти`,
    body: 'Виж какво мислят колегите за днешния ти избор.',
    data: { screen: 'Today' },
  });
}
