import { randomUUID } from 'expo-crypto';

import {
  createMaintenanceTicket,
  validateMaintenance,
  type MaintenanceErrorCode,
  type MaintenanceInput,
} from '@/db/repositories/maintenance';
import type { AppDatabase } from '@/db/types';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';

export type MaintenanceResult = { ok: true; mobileUuid: string } | { ok: false; issues: MaintenanceErrorCode[] };

/** Validasi + simpan tiket perawatan (nomor tiket dibuat ERP saat posting). */
export function saveMaintenanceTicket(db: AppDatabase, ctx: TxContext, input: MaintenanceInput): MaintenanceResult {
  const issues = validateMaintenance(db, input);
  if (issues.length) return { ok: false, issues };
  const common = makeTxCommon(ctx, randomUUID(), input.correctionOf ?? null);
  return { ok: true, mobileUuid: createMaintenanceTicket(db, common, input) };
}
