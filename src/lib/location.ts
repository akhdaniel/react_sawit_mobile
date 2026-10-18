/**
 * Pengambilan posisi GPS (bekerja tanpa sinyal seluler). Field `mocked` dari expo-location
 * dipakai untuk deteksi fake GPS — transaksi tetap disimpan, hanya diberi flag.
 */
export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  mocked: boolean;
  timestampMs: number;
  source: 'current' | 'last_known';
}

export type LocationFailure = 'permission_denied' | 'services_disabled' | 'unavailable';
export type FixResult = { ok: true; fix: GeoFix } | { ok: false; reason: LocationFailure };

/** Bagian expo-location yang dipakai — memudahkan uji tanpa perangkat. */
export interface LocationApi {
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  hasServicesEnabledAsync(): Promise<boolean>;
  getCurrentPositionAsync(options: { accuracy: number; mayShowUserSettingsDialog?: boolean }): Promise<RawLocation>;
  getLastKnownPositionAsync(options: { maxAge: number; requiredAccuracy?: number }): Promise<RawLocation | null>;
}

export interface RawLocation {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
  mocked?: boolean;
}

/** expo-location Accuracy.High */
const ACCURACY_HIGH = 4;

export interface FixOptions {
  timeoutMs?: number;
  /** Umur maksimum posisi terakhir yang masih boleh dipakai bila GPS lambat. */
  maxAgeMs?: number;
}

function toFix(raw: RawLocation, source: GeoFix['source']): GeoFix {
  return {
    lat: raw.coords.latitude,
    lng: raw.coords.longitude,
    accuracyM: raw.coords.accuracy ?? null,
    mocked: raw.mocked === true,
    timestampMs: raw.timestamp,
    source,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

export async function getFix(api: LocationApi, opts: FixOptions = {}): Promise<FixResult> {
  const { timeoutMs = 15_000, maxAgeMs = 120_000 } = opts;
  const perm = await api.requestForegroundPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'permission_denied' };
  if (!(await api.hasServicesEnabledAsync())) return { ok: false, reason: 'services_disabled' };

  const current = await withTimeout(api.getCurrentPositionAsync({ accuracy: ACCURACY_HIGH }), timeoutMs);
  if (current) return { ok: true, fix: toFix(current, 'current') };

  const last = await api.getLastKnownPositionAsync({ maxAge: maxAgeMs }).catch(() => null);
  if (last) return { ok: true, fix: toFix(last, 'last_known') };
  return { ok: false, reason: 'unavailable' };
}
