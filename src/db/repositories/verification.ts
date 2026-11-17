/**
 * Lanjutkan tahap tiket panen: antrean "Tiket Menunggu Verifikasi" (cache server) + transaksi stage_confirm.
 *
 * - Lanjutkan pada tiket HP ini merujuk target_uuid; dari antrean merujuk core_ticket_id (tiket ERP, bisa
 *   dari HP lain atau input ERP).
 * - Lanjutkan yang ditolak server boleh diulang (mis. setelah tarif dibuat); yang lain hanya sekali.
 */
import { and, asc, desc, eq, ne } from 'drizzle-orm';

import type { VerificationItem } from '../../sync/contract';
import { harvestTicket, stageConfirm, verificationQueue } from '../schema';
import type { AppDatabase } from '../types';

export type VerificationRow = typeof verificationQueue.$inferSelect;
export type StageConfirmRow = typeof stageConfirm.$inferSelect;
export type NewStageConfirm = typeof stageConfirm.$inferInsert;

export type ContinueErrorCode = 'unknown_target' | 'ticket_rejected' | 'ticket_corrected' | 'already_continued';

/** Ganti seluruh antrean dengan data server terbaru (atomik). */
export function replaceVerificationQueue(db: AppDatabase, items: VerificationItem[], fetchedAt: string): void {
  db.transaction((tx) => {
    tx.delete(verificationQueue).run();
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
  });
}

/** Lanjutkan dari HP ini yang masih berlaku (tidak ditolak server). */
function activeConfirms(db: AppDatabase): StageConfirmRow[] {
  return db.select().from(stageConfirm).where(ne(stageConfirm.status, 'rejected')).all();
}

/** Antrean yang belum dilanjutkan dari HP ini, tanggal terbaru dulu. */
export function pendingVerifications(db: AppDatabase): VerificationRow[] {
  const active = activeConfirms(db);
  const cores = new Set(active.map((c) => c.coreTicketId).filter((x): x is number => x != null));
  const uuids = new Set(active.map((c) => c.targetUuid).filter((x): x is string => x != null));
  return db
    .select()
    .from(verificationQueue)
    .orderBy(desc(verificationQueue.workDate), asc(verificationQueue.name))
    .all()
    .filter((r) => !cores.has(r.coreTicketId) && !(r.mobileUuid && uuids.has(r.mobileUuid)));
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

export function validateContinueTicket(db: AppDatabase, ticketUuid: string): ContinueErrorCode | null {
  const ticket = db.select({ s: harvestTicket.status }).from(harvestTicket).where(eq(harvestTicket.mobileUuid, ticketUuid)).get();
  if (!ticket) return 'unknown_target';
  if (ticket.s === 'rejected') return 'ticket_rejected';
  const corrected = db
    .select({ u: harvestTicket.mobileUuid })
    .from(harvestTicket)
    .where(and(eq(harvestTicket.correctionOf, ticketUuid), ne(harvestTicket.status, 'rejected')))
    .get();
  if (corrected) return 'ticket_corrected';
  const last = latestConfirmFor(db, ticketUuid);
  if (last && last.status !== 'rejected') return 'already_continued';
  return null;
}

export function validateContinueQueued(db: AppDatabase, coreTicketId: number): ContinueErrorCode | null {
  if (!pendingVerifications(db).some((r) => r.coreTicketId === coreTicketId)) {
    const known = db.select({ id: verificationQueue.coreTicketId }).from(verificationQueue).where(eq(verificationQueue.coreTicketId, coreTicketId)).get();
    return known ? 'already_continued' : 'unknown_target';
  }
  return null;
}

export function saveStageConfirm(db: AppDatabase, row: NewStageConfirm): void {
  db.insert(stageConfirm).values(row).run();
}

