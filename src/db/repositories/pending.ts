import { count, inArray, ne } from 'drizzle-orm';

import { photo, TRANSACTION_TYPES, transactionTables, type TransactionType } from '../schema';
import { PENDING_STATUSES } from '../tx-status';
import type { AppDatabase } from '../types';

export interface PendingSummary {
  /** Total transaksi belum dikonfirmasi server (angka di header). */
  total: number;
  byType: Record<TransactionType, number>;
  /** Foto yang belum terunggah. */
  photos: number;
}

export function getPendingSummary(db: AppDatabase): PendingSummary {
  const byType = {} as Record<TransactionType, number>;
  let total = 0;
  for (const type of TRANSACTION_TYPES) {
    const table = transactionTables[type];
    const row = db
      .select({ n: count() })
      .from(table)
      .where(inArray(table.status, [...PENDING_STATUSES]))
      .get();
    byType[type] = row?.n ?? 0;
    total += byType[type];
  }
  const photos = db.select({ n: count() }).from(photo).where(ne(photo.uploadStatus, 'uploaded')).get()?.n ?? 0;
  return { total, byType, photos };
}

/** Nama tabel yang perubahannya memengaruhi ringkasan pending. */
export const PENDING_WATCH_TABLES: readonly string[] = [
  ...TRANSACTION_TYPES.map((t) => t as string),
  'photo',
];
