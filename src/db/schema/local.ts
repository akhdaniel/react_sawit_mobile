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

/**
 * Cache antrean approval asisten dari GET /approvals (milik server, ditarik saat sinkron)
 * agar asisten bisa memeriksa dan memutuskan tanpa sinyal.
 */
export const approvalInbox = sqliteTable('approval_inbox', {
  targetUuid: text('target_uuid').primaryKey(),
  targetType: text('target_type').notNull(),
  summary: text('summary').notNull(),
  flags: text('flags', { mode: 'json' }).$type<string[]>().notNull(),
  afdelingId: integer('afdeling_id').notNull(),
  fetchedAt: text('fetched_at').notNull(),
});
