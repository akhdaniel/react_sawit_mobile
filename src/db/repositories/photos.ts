import { eq } from 'drizzle-orm';

import { photo } from '../schema';
import type { AppDatabase } from '../types';

export type NewPhoto = typeof photo.$inferInsert;

export function insertPhoto(db: AppDatabase, row: NewPhoto): void {
  db.insert(photo).values(row).run();
}

/** Tautkan foto ke transaksi pemiliknya (sebelum diunggah). */
export function linkPhoto(db: AppDatabase, photoId: string, transactionUuid: string): void {
  db.update(photo).set({ transactionUuid }).where(eq(photo.id, photoId)).run();
}
