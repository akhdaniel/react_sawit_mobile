import { eq } from 'drizzle-orm';

import { employee } from '../schema';
import type { AppDatabase } from '../types';
import { employeeRefFromTexts } from '../../lib/nfc-parse';

export type EmployeeRow = typeof employee.$inferSelect;

/** Cari pekerja dari kartu NFC: teks NDEF XSM1|EMP|… lebih dulu, lalu UID terdaftar. */
export function findEmployeeByCard(db: AppDatabase, card: { uid: string | null; texts: string[] }): EmployeeRow | null {
  const ref = employeeRefFromTexts(card.texts);
  if (ref?.employeeId != null) {
    const e = db.select().from(employee).where(eq(employee.id, ref.employeeId)).get();
    // NIK di kartu harus cocok bila ada (kartu lama / salah tulis tidak diterima).
    if (e && (!ref.nik || ref.nik === e.nik)) return e;
  }
  if (card.uid) return db.select().from(employee).where(eq(employee.nfcUid, card.uid.toUpperCase())).get() ?? null;
  return null;
}
