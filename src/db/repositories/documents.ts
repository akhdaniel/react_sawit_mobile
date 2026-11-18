/**
 * Dokumen ERP hasil posting tiket panen / SPB / tiket pemupukan (nomor, status ERP, netto timbang), dari
 * GET /transactions/status. Milik server: HP hanya menyimpan salinan terakhir.
 */
import { eq } from 'drizzle-orm';

import type { TxDocument } from '../../sync/contract';
import { transactionTables, txDocument } from '../schema';
import type { AppDatabase } from '../types';

/** Status ERP yang tidak berubah lagi: berhenti ditanyakan ke server. */
export const FINAL_DOCUMENT_STATES: Readonly<
  Record<'harvest_ticket' | 'spb' | 'fertilization_ticket' | 'maintenance_ticket', readonly string[]>
> = {
  harvest_ticket: ['closed', 'cancel'],
  spb: ['received', 'rejected', 'cancel'],
  fertilization_ticket: ['closed', 'cancel'],
  maintenance_ticket: ['closed', 'cancel'],
};

/** Berapa hari tiket/SPB yang sudah posted masih dipantau status ERP-nya. */
export const DOCUMENT_WATCH_DAYS = 14;

export type TxDocumentRow = typeof txDocument.$inferSelect;

export function getDocument(db: AppDatabase, mobileUuid: string): TxDocumentRow | null {
  return db.select().from(txDocument).where(eq(txDocument.mobileUuid, mobileUuid)).get() ?? null;
}

export function upsertDocument(db: AppDatabase, mobileUuid: string, doc: TxDocument, nowIso: string): void {
  const values = {
    name: doc.name,
    state: doc.state,
    stateLabel: doc.state_label ?? null,
    netKg: doc.net_kg ?? null,
    stage: doc.stage ?? null,
    updatedAt: nowIso,
  };
  db.insert(txDocument)
    .values({ mobileUuid, ...values })
    .onConflictDoUpdate({ target: txDocument.mobileUuid, set: values })
    .run();
}

/** Alasan gagal posting ke ERP untuk transaksi yang masih diterima (null bila tidak ada). */
export function postErrorOf(db: AppDatabase, mobileUuid: string): string | null {
  for (const table of Object.values(transactionTables)) {
    const row = db.select({ s: table.status, r: table.rejectReason }).from(table).where(eq(table.mobileUuid, mobileUuid)).get();
    if (row) return row.s === 'accepted' ? row.r : null;
  }
  return null;
}
