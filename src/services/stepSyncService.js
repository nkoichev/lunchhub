import { Platform } from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncStepsFromDevice, todayDateString, dateStringDaysAgo } from './stepService';

const LAST_SYNC_KEY = 'lunchhub.stepSync.lastAt';
const SYNC_DAYS = 7; // trailing days pulled on every sync (fills weekend gaps)

// Local calendar day for `dateStr` ('YYYY-MM-DD') as a [start, end) range —
// what Health Connect's `between` timeRangeFilter expects.
function dayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

async function readDaySteps(aggregateRecord, dateStr) {
  const result = await aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', ...dayRange(dateStr) },
  });
  return Math.max(0, Math.round(result?.COUNT_TOTAL || 0));
}

// Core flow: check availability, ensure the Steps-read permission, read the
// last SYNC_DAYS days from Health Connect, upload. Throws a user-facing
// message on any problem. `interactive` decides whether a missing
// permission triggers the system prompt or just fails quietly.
async function runSync(user, { interactive }) {
  if (Platform.OS !== 'android') throw new Error('Стъпките се четат от Health Connect (само на Android).');
  if (!Device.isDevice) throw new Error('Нужно е истинско устройство (не емулатор).');

  let mod;
  try {
    mod = require('react-native-health-connect');
  } catch (_) {
    throw new Error('Модулът за Health Connect липсва в тази версия на приложението.');
  }
  const {
    getSdkStatus,
    initialize,
    requestPermission,
    getGrantedPermissions,
    aggregateRecord,
    SdkAvailabilityStatus,
  } = mod;

  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) {
    throw new Error('Health Connect не е наличен на това устройство.');
  }
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    throw new Error('Обнови Health Connect от Google Play и опитай пак.');
  }
  if (!(await initialize())) throw new Error('Health Connect не можа да се инициализира.');

  const granted = await getGrantedPermissions();
  let hasStepsRead = granted?.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
  if (!hasStepsRead) {
    if (!interactive) throw new Error('Няма разрешение за четене на стъпки.');
    const requested = await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
    hasStepsRead = requested?.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
    if (!hasStepsRead) throw new Error('Няма разрешение за четене на стъпки от Health Connect.');
  }

  const entries = [];
  for (let i = 0; i < SYNC_DAYS; i++) {
    const date = dateStringDaysAgo(i);
    entries.push({ date, steps: await readDaySteps(aggregateRecord, date) });
  }

  await syncStepsFromDevice(user, entries);
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

  return {
    today: entries[0].steps,
    yesterday: entries[1]?.steps ?? 0,
    entries,
  };
}

// Silent sync — runs on app open and every time the Steps tab gains focus.
// Never prompts, never throws.
export async function syncDeviceSteps(user) {
  if (Platform.OS !== 'android' || !user || !Device.isDevice) return;
  try {
    await runSync(user, { interactive: false });
  } catch (_) {
    // Non-fatal — the manual "refresh" button surfaces real problems.
  }
}

// User-triggered sync (the button in the Steps tab). Surfaces the reason
// nothing happened, and prompts for the permission if it's missing.
export async function syncDeviceStepsNow(user) {
  if (!user) throw new Error('Влез в профила си първо.');
  return runSync(user, { interactive: true });
}

// ISO timestamp of the last successful sync on this device, or null.
export async function lastSyncAt() {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch (_) {
    return null;
  }
}
