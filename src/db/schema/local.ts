/**
 * Tabel lokal milik HP (bukan master, bukan transaksi).
 */
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

/**
 * Dokumen ERP hasil posting transaksi (tiket panen / SPB) dari GET /transactions/status:
 * nomor, status ERP (mis. Terverifikasi, Diterima PKS), dan netto timbang. Milik server.
 */
export const txDocument = sqliteTable('tx_document', {
  mobileUuid: text('mobile_uuid').primaryKey(),
  name: text('name').notNull(),
  state: text('state').notNull(),
  stateLabel: text('state_label'),
  netKg: real('net_kg'),
  /** Tahap ERP (mis. Verifikasi Mandor). */
  stage: text('stage'),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Cache antrean "Tiket Menunggu Verifikasi" dari GET /verifications (milik server, ditarik saat sinkron):
 * tiket panen ERP yang tahap berikutnya milik user ini, termasuk tiket dari HP lain.
 */
export const verificationQueue = sqliteTable('verification_queue', {
  coreTicketId: integer('core_ticket_id').primaryKey(),
  name: text('name').notNull(),
  workDate: text('work_date').notNull(),
  stage: text('stage'),
  blockCode: text('block_code').notNull(),
  tphCode: text('tph_code').notNull(),
  subBlokName: text('sub_blok_name'),
  harvesterId: integer('harvester_id').notNull(),
  harvesterName: text('harvester_name').notNull(),
  gangName: text('gang_name'),
  ripe: integer('ripe').notNull(),
  unripe: integer('unripe').notNull(),
  rotten: integer('rotten').notNull(),
  emptyBunch: integer('empty_bunch').notNull(),
  longStalk: integer('long_stalk').notNull(),
  looseFruitKg: real('loose_fruit_kg').notNull(),
  isLateEntry: integer('is_late_entry', { mode: 'boolean' }).notNull(),
  hasPhoto: integer('has_photo', { mode: 'boolean' }).notNull(),
  mobileUuid: text('mobile_uuid'),
  createdBy: text('created_by'),
  fetchedAt: text('fetched_at').notNull(),
});

/** Seperti verification_queue, untuk tiket pemupukan ERP (mandor rawat, lalu kerani rawat). */
export const fertilizationVerificationQueue = sqliteTable('fertilization_verification_queue', {
  coreTicketId: integer('core_ticket_id').primaryKey(),
  name: text('name').notNull(),
  workDate: text('work_date').notNull(),
  stage: text('stage'),
  blockCode: text('block_code').notNull(),
  subBlokName: text('sub_blok_name'),
  workerId: integer('worker_id').notNull(),
  workerName: text('worker_name').notNull(),
  gangName: text('gang_name'),
  fertilizerName: text('fertilizer_name').notNull(),
  method: text('method', { enum: ['manual', 'mekanis', 'drone'] }).notNull(),
  applicationRound: integer('application_round'),
  treeCount: integer('tree_count').notNull(),
  qtyKg: real('qty_kg').notNull(),
  mobileUuid: text('mobile_uuid'),
  createdBy: text('created_by'),
  fetchedAt: text('fetched_at').notNull(),
});

/**
 * Cache absensi masuk hari kerja dari GET /attendance/present (milik server, ditarik saat sinkron): pekerja yang
 * diabsen di HP lain dikenali hadir (pekerja bantuan) dan tidak diabsen ulang di kemandoran lain.
 */
export const presentWorker = sqliteTable(
  'present_worker',
  {
    workDate: text('work_date').notNull(),
    employeeId: integer('employee_id').notNull(),
    gangId: integer('gang_id').notNull(),
    attStatus: text('att_status', { enum: ['hadir', 'terlambat', 'sakit', 'izin', 'mangkir'] }).notNull(),
    checkedOut: integer('checked_out', { mode: 'boolean' }).notNull(),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workDate, t.employeeId] })],
);

/** Baris material tiket perawatan di antrean verifikasi (untuk ditampilkan saja). */
export interface QueuedMaterial {
  name: string;
  qty: number;
  uom: string;
}

/** Seperti verification_queue, untuk tiket perawatan ERP (mandor rawat, lalu kerani rawat). */
export const maintenanceVerificationQueue = sqliteTable('maintenance_verification_queue', {
  coreTicketId: integer('core_ticket_id').primaryKey(),
  name: text('name').notNull(),
  workDate: text('work_date').notNull(),
  stage: text('stage'),
  blockCode: text('block_code').notNull(),
  subBlokName: text('sub_blok_name'),
  workerId: integer('worker_id').notNull(),
  workerName: text('worker_name').notNull(),
  gangName: text('gang_name'),
  workType: text('work_type').notNull(),
  areaHa: real('area_ha').notNull(),
  treeCount: integer('tree_count').notNull(),
  hk: real('hk').notNull(),
  materials: text('materials', { mode: 'json' }).$type<QueuedMaterial[]>().notNull(),
  mobileUuid: text('mobile_uuid'),
  createdBy: text('created_by'),
  fetchedAt: text('fetched_at').notNull(),
});
