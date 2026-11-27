/**
 * Request/response kontrak REST /xsm/v1. Semua respons sukses membawa server_time (ISO)
 * untuk kalibrasi trusted-time dan server_id (UUID database; opsional di server lama) untuk
 * mengenali pindah server. Error: {error:{code,message}}.
 */
import { z } from 'zod';

import {
  FERTILIZATION_METHODS,
  MAINTENANCE_WORK_TYPES,
  MASTER_ENTITY_NAMES,
  masterSchemas,
  workPlanSchema,
  type MasterEntityName,
} from './master';
import { MAX_TX_BATCH, TX_TYPE_NAMES, txItemSchema } from './transactions';

const id = z.int().positive();
const uuid = z.uuid();
export const serverTime = z.iso.datetime({ offset: true });
/** UUID database Odoo: membedakan ganti alamat server yang sama dari pindah ke server lain. */
export const serverId = z.string().min(1);

export const ROLES = ['mandor_panen', 'kerani_panen', 'mandor_rawat', 'kerani_rawat', 'kerani_transport', 'asisten', 'inspektur'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  server_time: serverTime.optional(),
  server_id: serverId.optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ---- Auth ----------------------------------------------------------------
export const authTokenRequestSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  device_id: z.string().min(1),
  device_model: z.string().min(1),
  app_version: z.string().min(1),
});

export const authRefreshRequestSchema = z.object({ refresh_token: z.string().min(1) });

export const authUserSchema = z.object({
  id,
  name: z.string().min(1),
  roles: z.array(roleSchema).min(1),
  afdeling_ids: z.array(id),
  /** Karyawan pengguna (inspektur/pelaksana tindak lanjut); null = belum ditautkan, kosong = server lama. */
  employee_id: id.nullish(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.int().positive(),
  user: authUserSchema,
  server_time: serverTime,
  /** Opsional: server lama belum mengirimnya. */
  server_id: serverId.optional(),
});
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;

// ---- Master --------------------------------------------------------------
const entityChanges = <E extends MasterEntityName>(e: E) =>
  z.object({ upserts: z.array(masterSchemas[e]).default([]), deletes: z.array(id).default([]) }).optional();

const changesShape = Object.fromEntries(MASTER_ENTITY_NAMES.map((e) => [e, entityChanges(e)])) as {
  [E in MasterEntityName]: ReturnType<typeof entityChanges<E>>;
};

export const masterResponseSchema = z.object({
  cursor: z.string().min(1),
  server_time: serverTime,
  /** true bila masih ada halaman berikutnya (panggil lagi dengan cursor baru). */
  has_more: z.boolean().optional().default(false),
  changes: z.object(changesShape),
});
export type MasterResponse = z.infer<typeof masterResponseSchema>;
export type MasterChanges = MasterResponse['changes'];

export const workplanResponseSchema = z.object({
  items: z.array(workPlanSchema),
  server_time: serverTime,
});

// ---- Transaksi -----------------------------------------------------------
export const transactionsRequestSchema = z.object({
  items: z.array(txItemSchema).min(1).max(MAX_TX_BATCH),
});

export const txResultStatus = z.enum(['accepted', 'rejected', 'duplicate']);
export const transactionsResponseSchema = z.object({
  results: z.array(
    z.object({
      mobile_uuid: uuid,
      status: txResultStatus,
      server_id: id.nullish(),
      reason: z.string().nullish(),
    }),
  ),
  server_time: serverTime,
});
export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>;

export const txServerStatus = z.enum(['accepted', 'rejected', 'posted', 'unknown']);
export const txDocumentSchema = z.object({
  name: z.string(),
  state: z.string(),
  state_label: z.string().nullish(),
  net_kg: z.number().nullish(),
  /** Tahap ERP (mis. Verifikasi Mandor); kosong bila dokumen tidak bertahap. */
  stage: z.string().nullish(),
});
export type TxDocument = z.infer<typeof txDocumentSchema>;
export const transactionStatusResponseSchema = z.object({
  results: z.array(
    z.object({
      mobile_uuid: uuid,
      status: txServerStatus,
      reason: z.string().nullish(),
      posted_at: serverTime.nullish(),
      /** Diterima tetapi gagal diposting ke ERP (dicoba ulang server); alasan untuk pengguna. */
      post_error: z.string().nullish(),
      /** Dokumen ERP hasil posting (tiket panen / SPB): nomor, status, netto timbang. */
      document: txDocumentSchema.nullish(),
    }),
  ),
  server_time: serverTime,
});

// ---- Foto ----------------------------------------------------------------
export const photoUploadFieldsSchema = z.object({
  mobile_uuid_photo: uuid,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  transaction_uuid: uuid,
});
export const photoUploadResponseSchema = z.object({ photo_id: id, server_time: serverTime });

// ---- Approval ------------------------------------------------------------
export const approvalItemSchema = z.object({
  target_uuid: uuid,
  target_type: z.enum(TX_TYPE_NAMES),
  summary: z.string(),
  flags: z.array(z.string()),
});
export const approvalsResponseSchema = z.object({ items: z.array(approvalItemSchema), server_time: serverTime });

export const approvalDecisionItemSchema = z.object({
  mobile_uuid: uuid,
  target_uuid: uuid,
  target_type: z.enum(TX_TYPE_NAMES),
  decision: z.enum(['approve', 'reject', 'correct']),
  note: z.string().nullable(),
  corrected_json: z.record(z.string(), z.unknown()).nullable(),
});
export const approvalsRequestSchema = z.object({ items: z.array(approvalDecisionItemSchema).min(1) });
export const approvalsPostResponseSchema = z.object({
  results: z.array(z.object({ mobile_uuid: uuid, status: txResultStatus, reason: z.string().nullish() })),
  server_time: serverTime,
});

// ---- Verifikasi tiket ------------------------------------------------------
/** Tiket panen ERP yang tahap berikutnya milik user ini (mandor: verifikasi mandor, kerani: verifikasi kerani). */
export const verificationItemSchema = z.object({
  core_ticket_id: id,
  name: z.string(),
  work_date: z.string(),
  stage: z.string().nullable(),
  block_code: z.string(),
  tph_code: z.string(),
  sub_blok_name: z.string().nullable(),
  harvester_id: id,
  harvester_name: z.string(),
  gang_name: z.string().nullable(),
  ripe: z.int().nonnegative(),
  unripe: z.int().nonnegative(),
  rotten: z.int().nonnegative(),
  empty_bunch: z.int().nonnegative(),
  long_stalk: z.int().nonnegative(),
  loose_fruit_kg: z.number().nonnegative(),
  is_late_entry: z.boolean(),
  has_photo: z.boolean(),
  /** Tiket berasal dari HP (mobile_uuid tiket HP), null bila diinput di ERP. */
  mobile_uuid: uuid.nullable(),
  created_by: z.string().nullable(),
});
export type VerificationItem = z.infer<typeof verificationItemSchema>;
/** Tiket pemupukan ERP yang menunggu Lanjutkan (mandor rawat, lalu kerani rawat). */
export const fertilizationVerificationItemSchema = z.object({
  core_ticket_id: id,
  name: z.string(),
  work_date: z.string(),
  stage: z.string().nullable(),
  block_code: z.string(),
  sub_blok_name: z.string().nullable(),
  worker_id: id,
  worker_name: z.string(),
  gang_name: z.string().nullable(),
  fertilizer_name: z.string(),
  method: z.enum(FERTILIZATION_METHODS),
  application_round: z.int().nonnegative().nullable(),
  tree_count: z.int().nonnegative(),
  qty_kg: z.number().nonnegative(),
  mobile_uuid: uuid.nullable(),
  created_by: z.string().nullable(),
});
export type FertilizationVerificationItem = z.infer<typeof fertilizationVerificationItemSchema>;
/** Tiket perawatan ERP yang menunggu Lanjutkan (mandor rawat, lalu kerani rawat), dengan baris materialnya. */
export const maintenanceVerificationItemSchema = z.object({
  core_ticket_id: id,
  name: z.string(),
  work_date: z.string(),
  stage: z.string().nullable(),
  block_code: z.string(),
  sub_blok_name: z.string().nullable(),
  worker_id: id,
  worker_name: z.string(),
  gang_name: z.string().nullable(),
  work_type: z.enum(MAINTENANCE_WORK_TYPES),
  area_ha: z.number().nonnegative(),
  tree_count: z.int().nonnegative(),
  hk: z.number().nonnegative(),
  materials: z.array(z.object({ name: z.string(), qty: z.number().nonnegative(), uom: z.string() })),
  mobile_uuid: uuid.nullable(),
  created_by: z.string().nullable(),
});
export type MaintenanceVerificationItem = z.infer<typeof maintenanceVerificationItemSchema>;
export const verificationsResponseSchema = z.object({
  items: z.array(verificationItemSchema),
  fertilization_items: z.array(fertilizationVerificationItemSchema).default([]),
  maintenance_items: z.array(maintenanceVerificationItemSchema).default([]),
  server_time: serverTime,
});
export type VerificationsResponse = z.infer<typeof verificationsResponseSchema>;

// ---- Device --------------------------------------------------------------
export const heartbeatRequestSchema = z.object({
  app_version: z.string().min(1),
  battery: z.number().min(0).max(1).nullable(),
  pending_count: z.int().nonnegative(),
  last_sync_at: serverTime.nullable(),
});
export const heartbeatResponseSchema = z.object({ ok: z.literal(true), server_time: serverTime });
