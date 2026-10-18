/**
 * Nomor tiket/SPB offline: <kode_afdeling>-<yyMMdd>-<device_short>-<seq 4 digit>.
 * Fungsi murni — alokasi seq atomik ada di src/db/repositories/sequence.ts.
 */
const DEVICE_SHORT_LEN = 4;

/** yyMMdd dari tanggal kalender YYYY-MM-DD (tanggal kerja, bukan jam HP). */
export function yymmdd(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`Tanggal tidak valid: ${isoDate}`);
  return `${m[1]!.slice(2)}${m[2]}${m[3]}`;
}

/**
 * device_short: 4 karakter A-Z0-9 turunan device_id (stabil per perangkat).
 * Memakai hash FNV-1a 32-bit → base36.
 */
export function deviceShortFrom(deviceId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < deviceId.length; i++) {
    h ^= deviceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(DEVICE_SHORT_LEN, '0').slice(-DEVICE_SHORT_LEN);
}

export function docPrefix(afdelingCode: string, isoDate: string, deviceShort: string): string {
  if (!/^[A-Z0-9]+$/.test(afdelingCode)) throw new Error(`Kode afdeling tidak valid: ${afdelingCode}`);
  if (!/^[A-Z0-9]{4}$/.test(deviceShort)) throw new Error(`device_short tidak valid: ${deviceShort}`);
  return `${afdelingCode}-${yymmdd(isoDate)}-${deviceShort}`;
}

export function formatDocNo(prefix: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) throw new Error(`Nomor urut di luar batas: ${seq}`);
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}
