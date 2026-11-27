/**
 * Kehadiran dari server (GET /attendance/present): absensi masuk hari kerja di afdeling pengguna dari HP mana pun.
 * Dipakai bersama absensi lokal agar pekerja bantuan yang diabsen di HP/kemandoran lain dikenali hadir.
 */
import { eq } from 'drizzle-orm';

import type { PresentWorker } from '../../sync/contract';
import { presentWorker } from '../schema';
import type { AppDatabase } from '../types';

export type PresentWorkerRow = typeof presentWorker.$inferSelect;

/** Ganti cache kehadiran satu tanggal kerja dengan data terbaru dari server. */
export function replacePresentWorkers(db: AppDatabase, workDate: string, items: readonly PresentWorker[], fetchedAt: string): void {
  db.transaction((tx) => {
    tx.delete(presentWorker).where(eq(presentWorker.workDate, workDate)).run();
    for (const i of items) {
      tx.insert(presentWorker)
        .values({
          workDate,
          employeeId: i.employee_id,
          gangId: i.gang_id,
          attStatus: i.att_status,
          checkedOut: i.checked_out,
          fetchedAt,
        })
        .run();
    }
  });
}

/** Absensi masuk menurut server pada tanggal kerja, per pekerja. */
export function serverPresence(db: AppDatabase, workDate: string): Map<number, PresentWorkerRow> {
  return new Map(
    db
      .select()
      .from(presentWorker)
      .where(eq(presentWorker.workDate, workDate))
      .all()
      .map((r) => [r.employeeId, r]),
  );
}
