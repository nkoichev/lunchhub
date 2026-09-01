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

// Pull yesterday's (final) and today's (running) step totals from Health
// Connect and upload them. Best-effort, exactly like registerForPushNotifications:
// never blocks or breaks the app if the phone/OS/permissions aren't cooperating.
// Runs at most once per calendar day per device.
export async function syncDeviceSteps(user) {
  if (Platform.OS !== 'android' || !user || !Device.isDevice) return;

  try {
    const today = todayDateString();
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (lastSync === today) return;

    // Deferred require: avoids crashing on Expo Go / builds without the
    // native module linked, since this package has no JS-only fallback.
    const {
      getSdkStatus,
      initialize,
      requestPermission,
      getGrantedPermissions,
      aggregateRecord,
      SdkAvailabilityStatus,
    } = require('react-native-health-connect');

    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return;
    if (!(await initialize())) return;

    const granted = await getGrantedPermissions();
    const hasStepsRead = granted?.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
    if (!hasStepsRead) {
      const requested = await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
      const ok = requested?.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
      if (!ok) return;
    }

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
  } catch (_) {
    // Non-fatal: manual step entry must keep working either way.
  }
}
