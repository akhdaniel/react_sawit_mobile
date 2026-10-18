/** Pemilihan karakteristik BLE untuk printer (murni, diuji unit). */
interface CharLike {
  serviceUUID: string;
  uuid: string;
  isWritableWithoutResponse: boolean;
  isWritableWithResponse: boolean;
}

export interface WritableTarget {
  serviceUUID: string;
  characteristicUUID: string;
  withoutResponse: boolean;
}

/** Pilih karakteristik tulis: utamakan write-without-response (lebih cepat) dari layanan printer umum. */
export function pickWritable(chars: CharLike[]): WritableTarget | null {
  const PREFERRED_SERVICES = ['000018f0', 'e7810a71', '49535343'];
  const writable = chars.filter((c) => c.isWritableWithoutResponse || c.isWritableWithResponse);
  const score = (c: (typeof writable)[number]) =>
    (PREFERRED_SERVICES.some((p) => c.serviceUUID.toLowerCase().startsWith(p)) ? 2 : 0) + (c.isWritableWithoutResponse ? 1 : 0);
  const best = [...writable].sort((a, b) => score(b) - score(a))[0];
  return best ? { serviceUUID: best.serviceUUID, characteristicUUID: best.uuid, withoutResponse: best.isWritableWithoutResponse } : null;
}

