/**
 * Pembaca kartu NFC (react-native-nfc-manager). Membaca UID + teks NDEF bila ada.
 */
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

import { decodeTextRecord, normalizeUid, type NdefRecordLike } from './nfc-parse';

export interface CardRead {
  uid: string | null;
  texts: string[];
}

let started: Promise<boolean> | null = null;

/** true bila HP punya NFC (inisialisasi sekali). */
export function nfcSupported(): Promise<boolean> {
  started ??= NfcManager.isSupported()
    .then(async (ok) => {
      if (ok) await NfcManager.start();
      return ok;
    })
    .catch(() => false);
  return started;
}

export async function nfcEnabled(): Promise<boolean> {
  return NfcManager.isEnabled().catch(() => false);
}

/** Tunggu kartu ditempelkan; null bila dibatalkan / timeout. */
export async function readCard(timeoutMs = 20_000): Promise<CardRead | null> {
  if (!(await nfcSupported())) throw new Error('NFC tidak didukung HP ini');
  const timer = setTimeout(() => void NfcManager.cancelTechnologyRequest().catch(() => undefined), timeoutMs);
  try {
    await NfcManager.requestTechnology([NfcTech.Ndef, NfcTech.NfcA, NfcTech.MifareClassic, NfcTech.IsoDep]);
    const tag = await NfcManager.getTag();
    if (!tag) return null;
    const texts = (tag.ndefMessage ?? [])
      .map((r) => decodeTextRecord(r as unknown as NdefRecordLike))
      .filter((s): s is string => s != null);
    return { uid: normalizeUid(tag.id), texts };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}

export function cancelRead(): void {
  void NfcManager.cancelTechnologyRequest().catch(() => undefined);
}
