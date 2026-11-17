/**
 * Tombol Lanjutkan tiket panen (seperti tombol Lanjutkan di form tiket panen ERP): disimpan sebagai transaksi
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

export type ContinueResult = { ok: true; mobileUuid: string } | { ok: false; code: ContinueErrorCode };

/** Lanjutkan tiket yang dibuat di HP ini. */
export function continueTicket(db: AppDatabase, ctx: TxContext, ticketUuid: string): ContinueResult {
  const code = validateContinueTicket(db, ticketUuid);
  if (code) return { ok: false, code };
  const mobileUuid = randomUUID();
  saveStageConfirm(db, { ...makeTxCommon(ctx, mobileUuid), targetType: 'harvest_ticket', targetUuid: ticketUuid, coreTicketId: null });
  return { ok: true, mobileUuid };
}

/** Lanjutkan tiket ERP dari antrean "Tiket Menunggu Verifikasi". */
export function continueQueued(db: AppDatabase, ctx: TxContext, coreTicketId: number): ContinueResult {
  const code = validateContinueQueued(db, coreTicketId);
  if (code) return { ok: false, code };
  const mobileUuid = randomUUID();
  saveStageConfirm(db, { ...makeTxCommon(ctx, mobileUuid), targetType: 'harvest_ticket', targetUuid: null, coreTicketId });
  return { ok: true, mobileUuid };
}
