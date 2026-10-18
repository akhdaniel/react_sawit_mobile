/**
 * Skema zod transaksi untuk POST /xsm/v1/transactions.
 * `payload` = kolom bisnis; `meta` = kolom audit/anti-fraud yang sama untuk semua tipe.
 */
import { z } from 'zod';

import { isoDate } from './master';

const id = z.int().positive();
const uuid = z.uuid();
const count = z.int().nonnegative();

/** <kode_afdeling>-<yyMMdd>-<device_short>-<seq 4 digit> */
export const DOC_NO_REGEX = /^[A-Z0-9]+-\d{6}-[A-Z0-9]{4}-\d{4}$/;
const docNo = z.string().regex(DOC_NO_REGEX, 'format nomor dokumen tidak valid');

export const txMetaSchema = z.object({
  user_id: id,
  device_id: z.string().min(1),
  created_trusted_at: z.iso.datetime({ offset: true }),
  device_time_at: z.iso.datetime({ offset: true }),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracy_m: z.number().nonnegative().nullable(),
  mocked: z.boolean(),
  rooted: z.boolean(),
  correction_of: uuid.nullable(),
  app_version: z.string().optional(),
});
export type TxMeta = z.infer<typeof txMetaSchema>;

export const attendancePayloadSchema = z
  .object({
    work_date: isoDate,
    employee_id: id,
    gang_id: id,
    type: z.enum(['check_in', 'check_out']),
    att_status: z.enum(['hadir', 'terlambat', 'sakit', 'izin', 'mangkir']),
    late_reason: z.string().nullable(),
    photo_id: uuid.nullable(),
    outside_afdeling: z.boolean(),
  })
  .refine((p) => p.att_status !== 'terlambat' || !!p.late_reason?.trim(), {
    message: 'alasan terlambat wajib diisi',
    path: ['late_reason'],
  });

export const assignmentPayloadSchema = z
  .object({
    work_date: isoDate,
    work_plan_id: id.nullable(),
    unplanned_reason: z.string().nullable(),
    activity_id: id,
    block_id: id,
    employee_ids: z.array(id).min(1),
  })
  .refine((p) => p.work_plan_id != null || !!p.unplanned_reason?.trim(), {
    message: 'penugasan di luar rencana wajib diberi alasan',
    path: ['unplanned_reason'],
  });

export const harvestTicketPayloadSchema = z.object({
  work_date: isoDate,
  ticket_no: docNo,
  tph_id: id,
  block_id: id,
  harvester_employee_id: id,
  ripe: count,
  unripe: count,
  rotten: count,
  empty_bunch: count,
  long_stalk: count,
  loose_fruit_kg: z.number().nonnegative(),
  est_kg: z.number().nonnegative(),
  photo_id: uuid.nullable(),
  is_late_entry: z.boolean(),
});

export const spbPayloadSchema = z.object({
  work_date: isoDate,
  spb_no: docNo,
  vehicle_id: id,
  driver_name: z.string().min(1),
  destination: z.enum(['internal_mill', 'partner_mill']),
  parent_spb_uuid: uuid.nullable(),
  total_bunch: count,
  est_kg: z.number().nonnegative(),
  photo_ids: z.array(uuid).min(2, 'minimal 2 foto'),
  harvest_ticket_uuids: z.array(uuid).min(1),
});

export const upkeepPayloadSchema = z.object({
  work_date: isoDate,
  activity_id: id,
  block_id: id,
  employee_ids: z.array(id).min(1),
  hk: z.number().nonnegative(),
  realized_ha: z.number().nonnegative().nullable(),
  realized_trees: count.nullable(),
  photo_id: uuid.nullable(),
});

export const materialUsagePayloadSchema = z
  .object({
    upkeep_uuid: uuid,
    product_id: id,
    qty: z.number().positive(),
    uom: z.string().min(1),
    over_dose: z.boolean(),
    approval_note: z.string().nullable(),
  })
  .refine((p) => !p.over_dose || !!p.approval_note?.trim(), {
    message: 'pemakaian melebihi dosis wajib diberi catatan',
    path: ['approval_note'],
  });

export const dailyReportPayloadSchema = z.object({
  date: isoDate,
  gang_id: id,
  summary_json: z.record(z.string(), z.unknown()),
  signature_png_id: uuid.nullable(),
});

export const approvalDecisionPayloadSchema = z.object({
  target_uuid: uuid,
  target_type: z.string().min(1),
  decision: z.enum(['approve', 'reject', 'correct']),
  note: z.string().nullable(),
  corrected_json: z.record(z.string(), z.unknown()).nullable(),
});

export const txPayloadSchemas = {
  attendance: attendancePayloadSchema,
  assignment: assignmentPayloadSchema,
  harvest_ticket: harvestTicketPayloadSchema,
  spb: spbPayloadSchema,
  upkeep: upkeepPayloadSchema,
  material_usage: materialUsagePayloadSchema,
  daily_report: dailyReportPayloadSchema,
  approval_decision: approvalDecisionPayloadSchema,
} as const;

export type TxTypeName = keyof typeof txPayloadSchemas;
export const TX_TYPE_NAMES = Object.keys(txPayloadSchemas) as TxTypeName[];
export type TxPayload<T extends TxTypeName> = z.infer<(typeof txPayloadSchemas)[T]>;

const itemOf = <T extends TxTypeName>(type: T) =>
  z.object({ type: z.literal(type), mobile_uuid: uuid, payload: txPayloadSchemas[type], meta: txMetaSchema });

export const txItemSchema = z.discriminatedUnion('type', [
  itemOf('attendance'),
  itemOf('assignment'),
  itemOf('harvest_ticket'),
  itemOf('spb'),
  itemOf('upkeep'),
  itemOf('material_usage'),
  itemOf('daily_report'),
  itemOf('approval_decision'),
]);
export type TxItem = z.infer<typeof txItemSchema>;

export const MAX_TX_BATCH = 500;
