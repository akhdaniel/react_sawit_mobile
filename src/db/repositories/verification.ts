/**
 * Lanjutkan tahap tiket panen/pemupukan: antrean "Tiket Menunggu Verifikasi" (cache server) + transaksi
 * stage_confirm.
 *
 * - Lanjutkan pada tiket HP ini merujuk target_uuid; dari antrean merujuk core_ticket_id (tiket ERP, bisa
 *   dari HP lain atau input ERP). Id tiket ERP hanya unik per jenis tiket, jadi selalu dipasangkan target_type.
 * - Lanjutkan yang ditolak server boleh diulang (mis. setelah tarif dibuat); yang lain hanya sekali.
 */
import { and, asc, desc, eq, ne } from 'drizzle-orm';

import type { FertilizationVerificationItem, StageTargetType, VerificationItem } from '../../sync/contract';
import { fertilizationTicket, fertilizationVerificationQueue, harvestTicket, stageConfirm, verificationQueue } from '../schema';
import type { AppDatabase } from '../types';

export type VerificationRow = typeof verificationQueue.$inferSelect;
export type FertilizationVerificationRow = typeof fertilizationVerificationQueue.$inferSelect;
export type StageConfirmRow = typeof stageConfirm.$inferSelect;
export type NewStageConfirm = typeof stageConfirm.$inferInsert;

export type ContinueErrorCode = 'unknown_target' | 'ticket_rejected' | 'ticket_corrected' | 'already_continued';

/** Ganti seluruh antrean dengan data server terbaru (atomik). */
export function replaceVerificationQueue(
  db: AppDatabase,
  items: VerificationItem[],
  fertilizationItems: FertilizationVerificationItem[],
  fetchedAt: string,
): void {
  db.transaction((tx) => {
    tx.delete(verificationQueue).run();
    tx.delete(fertilizationVerificationQueue).run();
    for (const i of items) {
      tx.insert(verificationQueue)
        .values({
          coreTicketId: i.core_ticket_id,
          name: i.name,
          workDate: i.work_date,
          stage: i.stage,
          blockCode: i.block_code,
          tphCode: i.tph_code,
          subBlokName: i.sub_blok_name,
          harvesterId: i.harvester_id,
          harvesterName: i.harvester_name,
          gangName: i.gang_name,
          ripe: i.ripe,
          unripe: i.unripe,
          rotten: i.rotten,
          emptyBunch: i.empty_bunch,
          longStalk: i.long_stalk,
          looseFruitKg: i.loose_fruit_kg,
          isLateEntry: i.is_late_entry,
          hasPhoto: i.has_photo,
          mobileUuid: i.mobile_uuid,
          createdBy: i.created_by,
          fetchedAt,
        })
        .run();
    }
    for (const i of fertilizationItems) {
      tx.insert(fertilizationVerificationQueue)
        .values({
          coreTicketId: i.core_ticket_id,
          name: i.name,
          workDate: i.work_date,
          stage: i.stage,
          blockCode: i.block_code,
          subBlokName: i.sub_blok_name,
          workerId: i.worker_id,
          workerName: i.worker_name,
          gangName: i.gang_name,
          fertilizerName: i.fertilizer_name,
          method: i.method,
          applicationRound: i.application_round,
          treeCount: i.tree_count,
          qtyKg: i.qty_kg,
          mobileUuid: i.mobile_uuid,
          createdBy: i.created_by,
          fetchedAt,
        })
        .run();
    }
  });
}

/** Lanjutkan dari HP ini yang masih berlaku (tidak ditolak server) untuk satu jenis tiket. */
function activeConfirms(db: AppDatabase, type: StageTargetType): { cores: Set<number>; uuids: Set<string> } {
  const rows = db
    .select()
    .from(stageConfirm)
    .where(and(ne(stageConfirm.status, 'rejected'), eq(stageConfirm.targetType, type)))
    .all();
  return {
    cores: new Set(rows.map((c) => c.coreTicketId).filter((x): x is number => x != null)),
    uuids: new Set(rows.map((c) => c.targetUuid).filter((x): x is string => x != null)),
  };
}

/** Antrean tiket panen yang belum dilanjutkan dari HP ini, tanggal terbaru dulu. */
export function pendingVerifications(db: AppDatabase): VerificationRow[] {
  const { cores, uuids } = activeConfirms(db, 'harvest_ticket');
  return db
    .select()
    .from(verificationQueue)
    .orderBy(desc(verificationQueue.workDate), asc(verificationQueue.name))
    .all()
    .filter((r) => !cores.has(r.coreTicketId) && !(r.mobileUuid && uuids.has(r.mobileUuid)));
}

/** Antrean tiket pemupukan yang belum dilanjutkan dari HP ini, tanggal terbaru dulu. */
export function pendingFertilizationVerifications(db: AppDatabase): FertilizationVerificationRow[] {
  const { cores, uuids } = activeConfirms(db, 'fertilization_ticket');
  return db
    .select()
    .from(fertilizationVerificationQueue)
    .orderBy(desc(fertilizationVerificationQueue.workDate), asc(fertilizationVerificationQueue.name))
    .all()
    .filter((r) => !cores.has(r.coreTicketId) && !(r.mobileUuid && uuids.has(r.mobileUuid)));
}

/** Jumlah semua tiket yang menunggu Lanjutkan dari user ini (badge menu). */
export function pendingVerificationCount(db: AppDatabase): number {
  return pendingVerifications(db).length + pendingFertilizationVerifications(db).length;
}

/** Lanjutkan terakhir untuk tiket HP `ticketUuid`. */
export function latestConfirmFor(db: AppDatabase, ticketUuid: string): StageConfirmRow | null {
  return (
    db
      .select()
      .from(stageConfirm)
      .where(eq(stageConfirm.targetUuid, ticketUuid))
      .orderBy(desc(stageConfirm.createdTrustedAt))
      .get() ?? null
  );
}

/** Status tiket HP dan koreksinya yang tidak ditolak (dasar validasi Lanjutkan). */
function ticketState(db: AppDatabase, type: StageTargetType, ticketUuid: string): { status: string; corrected: boolean } | null {
  const table = type === 'harvest_ticket' ? harvestTicket : fertilizationTicket;
  const ticket = db.select({ s: table.status }).from(table).where(eq(table.mobileUuid, ticketUuid)).get();
  if (!ticket) return null;
  const correction = db
    .select({ u: table.mobileUuid })
    .from(table)
    .where(and(eq(table.correctionOf, ticketUuid), ne(table.status, 'rejected')))
    .get();
  return { status: ticket.s, corrected: !!correction };
}

export function validateContinueTicket(
  db: AppDatabase,
  ticketUuid: string,
  type: StageTargetType = 'harvest_ticket',
): ContinueErrorCode | null {
  const ticket = ticketState(db, type, ticketUuid);
  if (!ticket) return 'unknown_target';
  if (ticket.status === 'rejected') return 'ticket_rejected';
  if (ticket.corrected) return 'ticket_corrected';
  const last = latestConfirmFor(db, ticketUuid);
  if (last && last.status !== 'rejected') return 'already_continued';
  return null;
}

export function validateContinueQueued(
  db: AppDatabase,
  coreTicketId: number,
  type: StageTargetType = 'harvest_ticket',
): ContinueErrorCode | null {
  const pending = type === 'harvest_ticket' ? pendingVerifications(db) : pendingFertilizationVerifications(db);
  if (!pending.some((r) => r.coreTicketId === coreTicketId)) {
    const table = type === 'harvest_ticket' ? verificationQueue : fertilizationVerificationQueue;
    const known = db.select({ id: table.coreTicketId }).from(table).where(eq(table.coreTicketId, coreTicketId)).get();
    return known ? 'already_continued' : 'unknown_target';
  }
  return null;
}

export function saveStageConfirm(db: AppDatabase, row: NewStageConfirm): void {
  db.insert(stageConfirm).values(row).run();
}
