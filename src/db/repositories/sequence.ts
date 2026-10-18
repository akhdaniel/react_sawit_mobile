import { sql } from 'drizzle-orm';

import { docPrefix, formatDocNo } from '../../lib/doc-number';
import { docSequence } from '../schema';
import type { AppDatabase } from '../types';

export type DocType = 'harvest_ticket' | 'spb';

/**
 * Alokasikan nomor dokumen berikutnya secara atomik (upsert + RETURNING),
 * sehingga dua simpan beruntun tidak pernah mendapat nomor sama.
 */
export function nextDocNo(
  db: AppDatabase,
  docType: DocType,
  afdelingCode: string,
  isoDate: string,
  deviceShort: string,
): string {
  const prefix = docPrefix(afdelingCode, isoDate, deviceShort);
  const row = db
    .insert(docSequence)
    .values({ docType, prefix, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [docSequence.docType, docSequence.prefix],
      set: { lastSeq: sql`${docSequence.lastSeq} + 1` },
    })
    .returning({ seq: docSequence.lastSeq })
    .get();
  return formatDocNo(prefix, row.seq);
}
