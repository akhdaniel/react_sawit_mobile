/**
 * Kolom umum transaksi (anti-fraud) — dipakai semua modul saat menyimpan transaksi baru.
 * Waktu dari trusted clock, lokasi + flag mocked dari GPS, flag rooted dari integritas.
 */
import type { GeoFix } from '../../lib/location';
import type { TrustedTime } from '../../lib/trusted-time';

export interface TxContext {
  userId: number;
  deviceId: string;
  trusted: TrustedTime;
  deviceNowIso: string;
  fix: GeoFix | null;
  rooted: boolean;
}

export interface TxCommon {
  mobileUuid: string;
  userId: number;
  deviceId: string;
  createdTrustedAt: string;
  deviceTimeAt: string;
  timeSource: 'server' | 'device';
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  mocked: boolean;
  rooted: boolean;
  status: 'queued';
  correctionOf: string | null;
}

export function makeTxCommon(ctx: TxContext, mobileUuid: string, correctionOf: string | null = null): TxCommon {
  return {
    mobileUuid,
    userId: ctx.userId,
    deviceId: ctx.deviceId,
    createdTrustedAt: ctx.trusted.iso,
    deviceTimeAt: ctx.deviceNowIso,
    timeSource: ctx.trusted.source,
    lat: ctx.fix?.lat ?? null,
    lng: ctx.fix?.lng ?? null,
    accuracyM: ctx.fix?.accuracyM ?? null,
    mocked: ctx.fix?.mocked ?? false,
    rooted: ctx.rooted,
    status: 'queued',
    correctionOf,
  };
}
