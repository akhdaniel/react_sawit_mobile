/**
 * Wiring service aplikasi (dibuat sekali setelah DB siap): trusted clock, HTTP/API client,
 * sesi, identitas perangkat, integritas, lokasi. Layar mengakses lewat useServices().
 */
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import { File } from 'expo-file-system';
import * as ExpoLocation from 'expo-location';
import JailMonkey from 'jail-monkey';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { deleteMeta, getMeta, META_KEYS, setMeta } from '../db/repositories/meta';
import { getPendingSummary } from '../db/repositories/pending';
import { useDb } from '../db/provider';
import type { AppDatabase } from '../db/types';
import { SessionService } from '../features/auth/session-service';
import type { TxContext } from '../features/common/tx-factory';
import { useSession } from '../features/auth/session-store';
import { useSecurity } from '../features/security/security-store';
import { useSync } from '../features/sync/sync-store';
import { createSyncApi } from '../sync/api';
import { ApiClient, TokenStore } from '../sync/api-client';
import { syncNow, type SyncResult } from '../sync/engine';
import { HttpClient } from '../sync/http';
import { deviceClock } from './clock';
import { apiBaseUrlSchema, appConfig } from './config';
import { getDeviceIdentity, type DeviceIdentity } from './device';
import { checkIntegrity, isCompromised } from './guard';
import { getFix, type FixResult, type LocationApi } from './location';
import { expoSecureKV } from './secure-kv.expo';
import { TrustedClock, type TimeAnchor } from './trusted-time';

export interface AppServices {
  db: AppDatabase;
  clock: TrustedClock;
  api: ApiClient;
  session: SessionService;
  device: DeviceIdentity;
  getBaseUrl(): string;
  setBaseUrl(url: string): void;
  /** Ambil posisi GPS dan perbarui status lokasi palsu. */
  refreshLocation(): Promise<FixResult>;
  /** Konteks anti-fraud untuk transaksi baru (posisi segar ≤ 60 dtk, trusted time, flag root). */
  txContext(): Promise<TxContext>;
  /** Jalankan sinkron (single-flight) dan perbarui store UI. */
  sync(): Promise<SyncResult>;
}

const ServicesContext = createContext<AppServices | null>(null);

let cached: { db: AppDatabase; services: AppServices } | null = null;

/** Service per proses (dipakai juga oleh background task di luar React). */
export function getServices(db: AppDatabase): AppServices {
  if (cached?.db !== db) cached = { db, services: createServices(db) };
  return cached.services;
}

function createServices(db: AppDatabase): AppServices {
  const clock = new TrustedClock(
    deviceClock,
    {
      load: () => {
        const raw = getMeta(db, META_KEYS.timeAnchor);
        return raw ? (JSON.parse(raw) as TimeAnchor) : null;
      },
      save: (a) => setMeta(db, META_KEYS.timeAnchor, JSON.stringify(a)),
    },
    appConfig.estateUtcOffsetMinutes,
  );

  const getBaseUrl = () => getMeta(db, META_KEYS.apiBaseUrl) ?? appConfig.apiBaseUrl;
  const setBaseUrl = (url: string) => {
    const parsed = apiBaseUrlSchema.parse(url);
    if (parsed === appConfig.apiBaseUrl) deleteMeta(db, META_KEYS.apiBaseUrl);
    else setMeta(db, META_KEYS.apiBaseUrl, parsed);
  };

  const http = new HttpClient({ baseUrl: getBaseUrl, onServerTime: (iso) => clock.calibrate(iso) });
  const api = new ApiClient(http, new TokenStore(expoSecureKV), () => clock.now().ms);

  const device = getDeviceIdentity(db, {
    androidId: () => Application.getAndroidId(),
    randomUUID: () => Crypto.randomUUID(),
    modelName: Device.modelName,
    appVersion: Application.nativeApplicationVersion,
  });

  const session = new SessionService({
    kv: expoSecureKV,
    api,
    sha256: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text),
    randomHex: (n) => Array.from(Crypto.getRandomBytes(n), (b) => b.toString(16).padStart(2, '0')).join(''),
    now: () => clock.now().ms,
    device: () => device,
    pendingCount: () => getPendingSummary(db).total,
    lastUserId: () => {
      const v = getMeta(db, META_KEYS.lastUserId);
      return v ? Number(v) : null;
    },
    setLastUserId: (id) => setMeta(db, META_KEYS.lastUserId, String(id)),
  });

  const refreshLocation = async () => {
    const result = await getFix(ExpoLocation as unknown as LocationApi);
    const sec = useSecurity.getState();
    if (result.ok) sec.setFix(result.fix);
    else sec.setLocationFailure(result.reason);
    return result;
  };

  const FIX_MAX_AGE_MS = 60_000;
  const txContext = async (): Promise<TxContext> => {
    const user = useSession.getState().user;
    if (!user) throw new Error('Belum login');
    let fix = useSecurity.getState().lastFix;
    if (!fix || Date.now() - fix.timestampMs > FIX_MAX_AGE_MS) {
      const r = await getFix(ExpoLocation as unknown as LocationApi, { timeoutMs: 8_000, maxAgeMs: FIX_MAX_AGE_MS });
      if (r.ok) {
        fix = r.fix;
        useSecurity.getState().setFix(r.fix);
      } else {
        fix = null;
        useSecurity.getState().setLocationFailure(r.reason);
      }
    }
    const integrity = useSecurity.getState().integrity;
    return {
      userId: user.id,
      deviceId: device.deviceId,
      trusted: clock.now(),
      deviceNowIso: new Date().toISOString(),
      fix,
      rooted: integrity ? isCompromised(integrity) : false,
    };
  };

  const syncApi = createSyncApi(api);
  const sync = async () => {
    const store = useSync.getState();
    store.setRunning(true);
    try {
      const result = await syncNow({
        db,
        api: syncApi,
        nowIso: () => clock.now().iso,
        workDate: () => clock.workDate(),
        appVersion: device.appVersion,
        battery: async () => {
          const level = await Battery.getBatteryLevelAsync();
          return level >= 0 ? level : null;
        },
        photoFileExists: (uri) => new File(uri).exists,
        onStep: (step) => useSync.getState().setStep(step),
      });
      useSync.getState().setResult(result);
      return result;
    } finally {
      useSync.getState().setRunning(false);
    }
  };

  const last = getMeta(db, META_KEYS.lastSyncResult);
  if (last) useSync.getState().setResult(JSON.parse(last) as SyncResult);

  return { db, clock, api, session, device, getBaseUrl, setBaseUrl, refreshLocation, sync, txContext };
}

export function ServicesProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const services = useMemo(() => getServices(db), [db]);

  useEffect(() => {
    void useSession.getState().init(services.session);
    useSecurity.getState().setIntegrity(
      checkIntegrity({
        isJailBroken: () => JailMonkey.isJailBroken(),
        hookDetected: () => JailMonkey.hookDetected(),
        canMockLocation: () => JailMonkey.canMockLocation(),
        isDevice: Device.isDevice,
      }),
    );

    // Kunci otomatis setelah lama di latar belakang (jam monotonic, bukan jam HP).
    const autoLockMs = appConfig.autoLockMinutes * 60_000;
    const sub = AppState.addEventListener('change', (state) => {
      const now = deviceClock.elapsedMs();
      if (state === 'background') useSession.getState().markBackground(now);
      else if (state === 'active') useSession.getState().markForeground(now, autoLockMs);
    });
    return () => sub.remove();
  }, [services]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices dipakai di luar ServicesProvider');
  return ctx;
}
