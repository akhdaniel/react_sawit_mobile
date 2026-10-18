import { randomUUID } from 'expo-crypto';
import { eq } from 'drizzle-orm';

import { createTicket, validateTicket, type CreatedTicket, type HarvestErrorCode, type HarvestInput } from '@/db/repositories/harvest';
import type { NewPhoto } from '@/db/repositories/photos';
import { block } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CapturedPhoto } from '@/features/camera/CameraCapture';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';

import { estKg } from './calc';

export type HarvestResult = { ok: true; ticket: CreatedTicket } | { ok: false; issues: HarvestErrorCode[] };

export function photoRowFor(p: CapturedPhoto, ctx: TxContext): NewPhoto {
  return {
    id: p.id,
    localUri: p.localUri,
    sha256: p.sha256,
    sizeBytes: p.sizeBytes,
    takenTrustedAt: ctx.trusted.iso,
    lat: ctx.fix?.lat ?? null,
    lng: ctx.fix?.lng ?? null,
    accuracyM: ctx.fix?.accuracyM ?? null,
    mocked: ctx.fix?.mocked ?? false,
  };
}

/** Validasi + hitung est_kg dari BJR blok + simpan tiket (nomor offline). */
export function saveHarvestTicket(
  db: AppDatabase,
  ctx: TxContext,
  input: HarvestInput,
  deviceShort: string,
  photo?: CapturedPhoto,
): HarvestResult {
  const issues = validateTicket(db, input);
  if (issues.length) return { ok: false, issues };
  const bjr = db.select({ bjr: block.bjrKg }).from(block).where(eq(block.id, input.blockId)).get()?.bjr ?? 0;
  const common = makeTxCommon(ctx, randomUUID(), input.correctionOf ?? null);
  const ticket = createTicket(db, common, input, estKg(input, bjr), deviceShort, photo ? photoRowFor(photo, ctx) : undefined);
  return { ok: true, ticket };
}
