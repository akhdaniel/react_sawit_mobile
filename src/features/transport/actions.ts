import { randomUUID } from 'expo-crypto';

import { createSpb, spbAfdelingCode, validateSpb, type SpbInput, type SpbIssue } from '@/db/repositories/transport';
import type { AppDatabase } from '@/db/types';
import type { CapturedPhoto } from '@/features/camera/CameraCapture';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';
import { photoRowFor } from '@/features/harvest/actions';

export type SpbResult = { ok: true; mobileUuid: string; spbNo: string } | { ok: false; issues: SpbIssue[] };

export function saveSpb(
  db: AppDatabase,
  ctx: TxContext,
  input: Omit<SpbInput, 'photoIds'>,
  photos: CapturedPhoto[],
  deviceShort: string,
  afdelingIds: number[],
): SpbResult {
  const full: SpbInput = { ...input, photoIds: photos.map((p) => p.id) };
  const issues = validateSpb(db, full);
  if (issues.length) return { ok: false, issues };
  const created = createSpb(
    db,
    makeTxCommon(ctx, randomUUID()),
    full,
    spbAfdelingCode(db, input.tickets, afdelingIds),
    deviceShort,
    photos.map((p) => photoRowFor(p, ctx)),
  );
  return { ok: true, ...created };
}

/** QR SPB untuk PKS/timbangan: XSM1|SPB|<uuid>|<spb_no>|<janjang>|<est_kg> */
export function encodeSpbQr(s: { mobileUuid: string; spbNo: string; totalBunch: number; estKg: number }): string {
  return `XSM1|SPB|${s.mobileUuid}|${s.spbNo}|${s.totalBunch}|${s.estKg}`;
}
