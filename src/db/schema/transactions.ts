/**
 * Transaksi — dibuat di HP, dikirim oleh sync engine.
 *
 * APPEND-ONLY: setelah keluar dari status draft/queued, kolom bisnis tidak boleh berubah;
 * koreksi = baris baru dengan correction_of = mobile_uuid asal. Aturan ini dijaga oleh
 * trigger SQLite (lihat migrasi append_only_guards) dan oleh src/db/tx-status.ts.
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { TX_STATUSES } from '../tx-status';

/** Kolom umum semua tabel transaksi. Dipanggil per tabel (builder kolom tidak boleh dibagi). */
const txColumns = () => ({
  mobileUuid: text('mobile_uuid').primaryKey(),
  userId: integer('user_id').notNull(),
  deviceId: text('device_id').notNull(),
  /** ISO-8601 UTC dari trusted-time (waktu server + selisih monotonic), bukan jam HP. */
  createdTrustedAt: text('created_trusted_at').notNull(),
  /** Jam HP saat dibuat — hanya untuk audit selisih dengan trusted time. */
  deviceTimeAt: text('device_time_at').notNull(),
  lat: real('lat'),
  lng: real('lng'),
  accuracyM: real('accuracy_m'),
  mocked: integer('mocked', { mode: 'boolean' }).notNull().default(false),
  /** Perangkat terdeteksi root/emulator saat transaksi dibuat. */
  rooted: integer('rooted', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: TX_STATUSES }).notNull().default('draft'),
  rejectReason: text('reject_reason'),
  serverId: integer('server_id'),
  sentAt: text('sent_at'),
  postedAt: text('posted_at'),
  correctionOf: text('correction_of'),
});

export const attendance = sqliteTable(
  'attendance',
  {
    ...txColumns(),
    /** YYYY-MM-DD (dari trusted time, zona waktu perangkat). */
    workDate: text('work_date').notNull(),
    employeeId: integer('employee_id').notNull(),
    gangId: integer('gang_id').notNull(),
    type: text('type', { enum: ['check_in', 'check_out'] }).notNull(),
    attStatus: text('att_status', { enum: ['hadir', 'terlambat', 'sakit', 'izin', 'mangkir'] }).notNull(),
    lateReason: text('late_reason'),
    photoId: text('photo_id'),
    outsideAfdeling: integer('outside_afdeling', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('attendance_date_employee_idx').on(t.workDate, t.employeeId),
    index('attendance_status_idx').on(t.status),
  ],
);

export const assignment = sqliteTable(
  'assignment',
  {
    ...txColumns(),
    workDate: text('work_date').notNull(),
    workPlanId: integer('work_plan_id'),
    unplannedReason: text('unplanned_reason'),
    activityId: integer('activity_id').notNull(),
    blockId: integer('block_id').notNull(),
    employeeIds: text('employee_ids', { mode: 'json' }).$type<number[]>().notNull(),
  },
  (t) => [index('assignment_date_idx').on(t.workDate), index('assignment_status_idx').on(t.status)],
);

export const harvestTicket = sqliteTable(
  'harvest_ticket',
  {
    ...txColumns(),
    workDate: text('work_date').notNull(),
    ticketNo: text('ticket_no').notNull(),
    tphId: integer('tph_id').notNull(),
    blockId: integer('block_id').notNull(),
    harvesterEmployeeId: integer('harvester_employee_id').notNull(),
    ripe: integer('ripe').notNull().default(0),
    unripe: integer('unripe').notNull().default(0),
    rotten: integer('rotten').notNull().default(0),
    emptyBunch: integer('empty_bunch').notNull().default(0),
    longStalk: integer('long_stalk').notNull().default(0),
    looseFruitKg: real('loose_fruit_kg').notNull().default(0),
    /** (ripe + unripe + rotten) × block.bjr_kg */
    estKg: real('est_kg').notNull(),
    photoId: text('photo_id'),
    isLateEntry: integer('is_late_entry', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    uniqueIndex('harvest_ticket_no_uq').on(t.ticketNo),
    index('harvest_ticket_date_tph_harvester_idx').on(t.workDate, t.tphId, t.harvesterEmployeeId),
    index('harvest_ticket_status_idx').on(t.status),
  ],
);

export const spb = sqliteTable(
  'spb',
  {
    ...txColumns(),
    workDate: text('work_date').notNull(),
    spbNo: text('spb_no').notNull(),
    vehicleId: integer('vehicle_id').notNull(),
    driverName: text('driver_name').notNull(),
    destination: text('destination', { enum: ['internal_mill', 'partner_mill'] }).notNull(),
    /** SPB induk untuk langsir. */
    parentSpbUuid: text('parent_spb_uuid'),
    totalBunch: integer('total_bunch').notNull(),
    estKg: real('est_kg').notNull(),
    /** Minimal 2 foto (divalidasi zod). */
    photoIds: text('photo_ids', { mode: 'json' }).$type<string[]>().notNull(),
  },
  (t) => [uniqueIndex('spb_no_uq').on(t.spbNo), index('spb_status_idx').on(t.status)],
);

/** Baris SPB — bagian dari payload SPB, ikut aturan append-only induknya. */
export const spbLine = sqliteTable(
  'spb_line',
  {
    spbUuid: text('spb_uuid').notNull(),
    harvestTicketUuid: text('harvest_ticket_uuid').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spbUuid, t.harvestTicketUuid] }),
    index('spb_line_ticket_idx').on(t.harvestTicketUuid),
  ],
);

export const upkeep = sqliteTable(
  'upkeep',
  {
    ...txColumns(),
    workDate: text('work_date').notNull(),
    activityId: integer('activity_id').notNull(),
    blockId: integer('block_id').notNull(),
    employeeIds: text('employee_ids', { mode: 'json' }).$type<number[]>().notNull(),
    hk: real('hk').notNull(),
    realizedHa: real('realized_ha'),
    realizedTrees: integer('realized_trees'),
    photoId: text('photo_id'),
  },
  (t) => [index('upkeep_date_idx').on(t.workDate), index('upkeep_status_idx').on(t.status)],
);

export const materialUsage = sqliteTable(
  'material_usage',
  {
    ...txColumns(),
    upkeepUuid: text('upkeep_uuid').notNull(),
    productId: integer('product_id').notNull(),
    qty: real('qty').notNull(),
    uom: text('uom').notNull(),
    overDose: integer('over_dose', { mode: 'boolean' }).notNull().default(false),
    approvalNote: text('approval_note'),
  },
  (t) => [index('material_usage_upkeep_idx').on(t.upkeepUuid), index('material_usage_status_idx').on(t.status)],
);

export const dailyReport = sqliteTable(
  'daily_report',
  {
    ...txColumns(),
    date: text('date').notNull(),
    gangId: integer('gang_id').notNull(),
    summaryJson: text('summary_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    signaturePngId: text('signature_png_id'),
  },
  (t) => [index('daily_report_date_gang_idx').on(t.date, t.gangId), index('daily_report_status_idx').on(t.status)],
);

export const approvalDecision = sqliteTable(
  'approval_decision',
  {
    ...txColumns(),
    targetUuid: text('target_uuid').notNull(),
    targetType: text('target_type').notNull(),
    decision: text('decision', { enum: ['approve', 'reject', 'correct'] }).notNull(),
    note: text('note'),
    correctedJson: text('corrected_json', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (t) => [index('approval_decision_target_idx').on(t.targetUuid), index('approval_decision_status_idx').on(t.status)],
);

export const photo = sqliteTable(
  'photo',
  {
    id: text('id').primaryKey(),
    /** Transaksi pemilik foto (diisi saat foto ditautkan). */
    transactionUuid: text('transaction_uuid'),
    localUri: text('local_uri').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    takenTrustedAt: text('taken_trusted_at').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    accuracyM: real('accuracy_m'),
    mocked: integer('mocked', { mode: 'boolean' }).notNull().default(false),
    uploadStatus: text('upload_status', { enum: ['pending', 'uploading', 'uploaded', 'failed'] })
      .notNull()
      .default('pending'),
    serverPhotoId: integer('server_photo_id'),
  },
  (t) => [index('photo_upload_status_idx').on(t.uploadStatus), index('photo_transaction_idx').on(t.transactionUuid)],
);

/** Tabel transaksi berkolom umum, dikunci dengan `type` di POST /transactions. */
export const transactionTables = {
  attendance,
  assignment,
  harvest_ticket: harvestTicket,
  spb,
  upkeep,
  material_usage: materialUsage,
  daily_report: dailyReport,
  approval_decision: approvalDecision,
} as const;

export type TransactionType = keyof typeof transactionTables;
export const TRANSACTION_TYPES = Object.keys(transactionTables) as TransactionType[];
