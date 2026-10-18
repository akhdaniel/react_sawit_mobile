/**
 * Request/response kontrak REST /xsm/v1. Semua respons sukses membawa server_time (ISO)
 * untuk kalibrasi trusted-time. Error: {error:{code,message}}.
 */
import { z } from 'zod';

import { MASTER_ENTITY_NAMES, masterSchemas, workPlanSchema, type MasterEntityName } from './master';
import { MAX_TX_BATCH, TX_TYPE_NAMES, txItemSchema } from './transactions';

const id = z.int().positive();
const uuid = z.uuid();
export const serverTime = z.iso.datetime({ offset: true });

export const ROLES = ['mandor_panen', 'kerani_panen', 'mandor_rawat', 'kerani_transport', 'asisten'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  server_time: serverTime.optional(),
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
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.int().positive(),
  user: authUserSchema,
  server_time: serverTime,
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
export const transactionStatusResponseSchema = z.object({
  results: z.array(
    z.object({
      mobile_uuid: uuid,
      status: txServerStatus,
      reason: z.string().nullish(),
      posted_at: serverTime.nullish(),
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

// ---- Device --------------------------------------------------------------
export const heartbeatRequestSchema = z.object({
  app_version: z.string().min(1),
  battery: z.number().min(0).max(1).nullable(),
  pending_count: z.int().nonnegative(),
  last_sync_at: serverTime.nullable(),
});
export const heartbeatResponseSchema = z.object({ ok: z.literal(true), server_time: serverTime });
