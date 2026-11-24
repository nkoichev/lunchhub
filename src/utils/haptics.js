import { Platform } from 'react-native';

// Haptic feedback (short phone vibrations) for taps that should "feel"
// like something happened: picking a dish, placing an order, reacting.
//
// expo-haptics is a native module, so it only exists in APKs built after it
// was added. An OTA update ships this JS to older APKs too — requiring the
// module there throws, so it's loaded lazily and every call degrades to a
// silent no-op instead of crashing. Web has no haptics at all.
let Haptics = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line global-require
    Haptics = require('expo-haptics');
  } catch (_) {
    Haptics = null;
  }
}

function safe(fn) {
  if (!Haptics) return;
  try {
    const p = fn(Haptics);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) {}
}

// Light tick — adding/removing a dish, toggling a chip.
export function tapHaptic() {
  safe((H) => H.impactAsync(H.ImpactFeedbackStyle.Light));
}

// Very short click — reel ticks while the payer roulette spins.
export function selectionHaptic() {
  safe((H) => H.selectionAsync());
}

// Firmer bump — e.g. reacting to someone's order.
export function mediumHaptic() {
  safe((H) => H.impactAsync(H.ImpactFeedbackStyle.Medium));
}

// "Done!" double buzz — order placed, roulette winner picked.
export function successHaptic() {
  safe((H) => H.notificationAsync(H.NotificationFeedbackType.Success));
}

export function errorHaptic() {
  safe((H) => H.notificationAsync(H.NotificationFeedbackType.Error));
}
