import { randomUUID } from 'expo-crypto';

import {
  createFertilizationTicket,
  validateFertilization,
  type FertilizationErrorCode,
  type FertilizationInput,
} from '@/db/repositories/fertilization';
import type { AppDatabase } from '@/db/types';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';

export type FertilizationResult = { ok: true; mobileUuid: string } | { ok: false; issues: FertilizationErrorCode[] };

/** Validasi + simpan tiket pemupukan (nomor tiket dibuat ERP saat posting). */
export function saveFertilizationTicket(db: AppDatabase, ctx: TxContext, input: FertilizationInput): FertilizationResult {
  const issues = validateFertilization(db, input);
  if (issues.length) return { ok: false, issues };
  const common = makeTxCommon(ctx, randomUUID(), input.correctionOf ?? null);
  return { ok: true, mobileUuid: createFertilizationTicket(db, common, input) };
}
