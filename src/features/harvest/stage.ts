/**
 * Tombol Lanjutkan tiket panen/pemupukan (seperti tombol Lanjutkan di form tiket ERP): disimpan sebagai transaksi
 * stage_confirm, diterapkan server saat sinkron atas nama user ini.
 */
import { randomUUID } from 'expo-crypto';

import {
  saveStageConfirm,
  validateContinueQueued,
  validateContinueTicket,
  type ContinueErrorCode,
} from '@/db/repositories/verification';
import type { AppDatabase } from '@/db/types';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';
import type { StageTargetType } from '@/sync/contract';

export type ContinueResult = { ok: true; mobileUuid: string } | { ok: false; code: ContinueErrorCode };

/** Lanjutkan tiket yang dibuat di HP ini. */
export function continueTicket(
  db: AppDatabase,
  ctx: TxContext,
  ticketUuid: string,
  type: StageTargetType = 'harvest_ticket',
): ContinueResult {
  const code = validateContinueTicket(db, ticketUuid, type);
  if (code) return { ok: false, code };
  const mobileUuid = randomUUID();
  saveStageConfirm(db, { ...makeTxCommon(ctx, mobileUuid), targetType: type, targetUuid: ticketUuid, coreTicketId: null });
  return { ok: true, mobileUuid };
}

/** Lanjutkan tiket ERP dari antrean "Tiket Menunggu Verifikasi". */
export function continueQueued(
  db: AppDatabase,
  ctx: TxContext,
  coreTicketId: number,
  type: StageTargetType = 'harvest_ticket',
): ContinueResult {
  const code = validateContinueQueued(db, coreTicketId, type);
  if (code) return { ok: false, code };
  const mobileUuid = randomUUID();
  saveStageConfirm(db, { ...makeTxCommon(ctx, mobileUuid), targetType: type, targetUuid: null, coreTicketId });
  return { ok: true, mobileUuid };
}
