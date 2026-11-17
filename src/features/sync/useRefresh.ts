import { router } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';

import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';

import { refreshDecision, refreshOutcome } from './refresh';
import { useSync } from './sync-store';

/** Waktu refresh terakhir, berlaku lintas layar (pindah layar tidak mengatur ulang jeda). */
let lastRefreshMs: number | null = null;

function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
}

/** Props untuk `<Screen refresh={...}>`: tarik layar ke bawah = sinkron. */
export function useRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const services = useServices();
  const refreshing = useSync((s) => s.running);

  const onRefresh = useCallback(() => {
    const now = Date.now();
    const decision = refreshDecision(now, lastRefreshMs, useSync.getState().running);
    if (decision === 'too_soon') {
      toast(t('refresh.tooSoon'));
      return;
    }
    if (decision === 'running') return; // indikator sudah berputar sampai sinkron selesai
    lastRefreshMs = now;
    void services.sync().then((result) => {
      const outcome = refreshOutcome(result);
      if (outcome.kind === 'auth') {
        Alert.alert(t('sync.reauthTitle'), t('sync.reauthHint'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('sync.reauthSubmit'), onPress: () => router.push('/sync') },
        ]);
      } else {
        toast(outcome.message);
      }
    });
  }, [services]);

  return { refreshing, onRefresh };
}
