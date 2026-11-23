/**
 * Tarik-untuk-refresh (pull-to-refresh): menjalankan sinkron yang sama dengan tombol Sinkron — kirim data HP
 * dulu, lalu tarik status, master, rencana kerja, antrean approval & verifikasi. Layar ikut ter-update sendiri
 * karena membaca SQLite secara reaktif.
 */
import type { SyncResult } from '../../sync/engine';
import { t } from '../../i18n/id';

/** Jeda minimum antar-refresh agar tarikan berulang di sinyal lemah tidak memicu sinkron terus-menerus. */
export const REFRESH_MIN_GAP_MS = 10_000;

export type RefreshDecision = 'run' | 'running' | 'too_soon';

export function refreshDecision(nowMs: number, lastRefreshMs: number | null, running: boolean): RefreshDecision {
  if (running) return 'running';
  if (lastRefreshMs != null && nowMs - lastRefreshMs < REFRESH_MIN_GAP_MS) return 'too_soon';
  return 'run';
}

export type RefreshOutcome = { kind: 'ok' | 'offline' | 'auth' | 'partial'; message: string };

/** Ringkasan hasil sinkron untuk pesan singkat setelah refresh. */
export function refreshOutcome(result: SyncResult): RefreshOutcome {
  if (result.errors.some((e) => e.kind === 'auth')) return { kind: 'auth', message: t('sync.errorKind.auth') };
  if (result.errors.some((e) => e.kind === 'offline')) return { kind: 'offline', message: t('sync.offline') };
  if (result.errors.length > 0) {
    return { kind: 'partial', message: `${t('sync.resultPartial')}: ${t(`sync.step.${result.errors[0]!.step}`)}` };
  }
  return { kind: 'ok', message: t('refresh.done') };
}
