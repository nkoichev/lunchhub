import { Platform } from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncStepsFromDevice, todayDateString, dateStringDaysAgo } from './stepService';

const LAST_SYNC_KEY = 'lunchhub.stepSync.lastDate';

// Local calendar day for `dateStr` ('YYYY-MM-DD') as a [start, end) ISO
// range — what Health Connect's timeRangeFilter expects.
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
  return result?.COUNT_TOTAL || 0;
}

// Core Health Connect flow: check availability, ensure the Steps-read
// permission, read yesterday + today, upload. Throws a user-facing message
// on any problem. Shared by the silent boot sync and the manual button.
async function runSync(user) {
  if (Platform.OS !== 'android') throw new Error('Health Connect е достъпен само на Android.');
  if (!Device.isDevice) throw new Error('Нужно е истинско устройство (не емулатор).');

  // Deferred require: avoids crashing on Expo Go / builds without the
  // native module linked, since this package has no JS-only fallback.
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
  const hasStepsRead = granted?.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
  if (!hasStepsRead) {
    const requested = await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
    const ok = requested?.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
    if (!ok) throw new Error('Няма разрешение за четене на стъпки от Health Connect.');
  }

  const today = todayDateString();
  const yesterday = dateStringDaysAgo(1);
  const [yesterdaySteps, todaySteps] = await Promise.all([
    readDaySteps(aggregateRecord, yesterday),
    readDaySteps(aggregateRecord, today),
  ]);

  await syncStepsFromDevice(user, [
    { date: yesterday, steps: yesterdaySteps },
    { date: today, steps: todaySteps },
  ]);
  await AsyncStorage.setItem(LAST_SYNC_KEY, today);

  return { today: todaySteps, yesterday: yesterdaySteps };
}

// Silent best-effort sync on app open. Never throws, never prompts twice
// a day. Same spirit as registerForPushNotifications.
export async function syncDeviceSteps(user) {
  if (Platform.OS !== 'android' || !user || !Device.isDevice) return;
  try {
    if ((await AsyncStorage.getItem(LAST_SYNC_KEY)) === todayDateString()) return;
    await runSync(user);
  } catch (_) {
    // Non-fatal: manual entry and the manual button remain.
  }
}

// User-triggered sync (button in the Steps tab). Surfaces errors so the
// user knows why nothing happened, and ignores the once-a-day guard.
export async function syncDeviceStepsNow(user) {
  if (!user) throw new Error('Влез в профила си първо.');
  return runSync(user);
}
