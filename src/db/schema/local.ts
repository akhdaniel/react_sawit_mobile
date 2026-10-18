/**
 * Tabel lokal milik HP (bukan master, bukan transaksi).
 */
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Key-value kecil: device_id, offset trusted-time, last_sync_at, dll. */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * Counter nomor dokumen offline per prefix + tanggal.
 * Nomor: <kode_afdeling>-<yyMMdd>-<device_short>-<seq 4 digit>.
 */
export const docSequence = sqliteTable(
  'doc_sequence',
  {
    docType: text('doc_type', { enum: ['harvest_ticket', 'spb'] }).notNull(),
    prefix: text('prefix').notNull(),
    lastSeq: integer('last_seq').notNull(),
  },
  (t) => [primaryKey({ columns: [t.docType, t.prefix] })],
);
