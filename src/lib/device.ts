/**
 * Identitas perangkat: device_id stabil (Android ID, fallback UUID) disimpan di app_meta,
 * device_short untuk nomor dokumen offline.
 *
 * device_short acak per instalasi, bukan turunan device_id: urutan nomor dokumen (doc_sequence) hilang saat
 * data aplikasi dihapus, sedangkan Android ID tetap. Bila device_short ikut tetap, nomor tiket kembali ke 0001
 * dan ditolak server sebagai duplicate_ticket_no.
 */
import { getMeta, META_KEYS, setMeta } from '../db/repositories/meta';
import type { AppDatabase } from '../db/types';
import { deviceShortFrom } from './doc-number';

export interface DeviceIdentity {
  deviceId: string;
  deviceShort: string;
  deviceModel: string;
  appVersion: string;
}

export interface DeviceInfoSource {
  androidId(): string | null;
  randomUUID(): string;
  modelName: string | null;
  appVersion: string | null;
}

export function getDeviceIdentity(db: AppDatabase, src: DeviceInfoSource): DeviceIdentity {
  let deviceId = getMeta(db, META_KEYS.deviceId);
  if (!deviceId) {
    let androidId: string | null = null;
    try {
      androidId = src.androidId();
    } catch {
      androidId = null;
    }
    deviceId = androidId ? `and-${androidId}` : `uuid-${src.randomUUID()}`;
    setMeta(db, META_KEYS.deviceId, deviceId);
  }
  let deviceShort = getMeta(db, META_KEYS.deviceShort);
  if (!deviceShort) {
    deviceShort = deviceShortFrom(`install-${src.randomUUID()}`);
    setMeta(db, META_KEYS.deviceShort, deviceShort);
  }
  return {
    deviceId,
    deviceShort,
    deviceModel: src.modelName ?? 'unknown',
    appVersion: src.appVersion ?? '0.0.0',
  };
}
