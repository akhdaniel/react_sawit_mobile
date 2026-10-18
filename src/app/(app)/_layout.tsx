import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { getPendingSummary } from '@/db/repositories/pending';
import { useServices } from '@/lib/services';
import { registerBackgroundSync } from '@/sync/background-task';

/** Sinkron otomatis saat Wi-Fi tersambung kembali, dibatasi agar tidak berulang-ulang. */
const AUTO_SYNC_MIN_GAP_MS = 10 * 60_000;

export default function AppLayout() {
  const services = useServices();

  useEffect(() => {
    void registerBackgroundSync().catch(() => undefined);
    let lastAuto = 0;
    return NetInfo.addEventListener((state) => {
      const now = Date.now();
      if (state.isConnected && state.type === 'wifi' && now - lastAuto > AUTO_SYNC_MIN_GAP_MS) {
        if (getPendingSummary(services.db).total === 0) return;
        lastAuto = now;
        void services.sync().catch(() => undefined);
      }
    });
  }, [services]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
