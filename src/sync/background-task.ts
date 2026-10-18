/**
 * Sinkron latar (best effort) via expo-background-task (WorkManager, interval ≥ 15 menit).
 * Hanya berjalan di Wi-Fi agar tidak memakai kuota data; sinkron manual tetap tersedia.
 * defineTask WAJIB dipanggil di scope global saat bundle dimuat (diimpor dari app/_layout).
 */
import NetInfo from '@react-native-community/netinfo';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { getAppDatabase } from '../db/client';
import { getServices } from '../lib/services';

export const SYNC_TASK = 'xsm-background-sync';
const INTERVAL_MINUTES = 60;

TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected || net.type !== 'wifi') return BackgroundTask.BackgroundTaskResult.Success;
    const { db } = await getAppDatabase();
    const services = getServices(db);
    if (!(await services.session.restore())) return BackgroundTask.BackgroundTaskResult.Success;
    await services.sync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return;
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: INTERVAL_MINUTES });
}
