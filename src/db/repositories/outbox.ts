/**
 * Outbox transaksi untuk sync engine.
 *
 * - Antrean = status queued + sent (sent = sudah dikirim tetapi hasilnya belum pasti, mis.
 *   koneksi putus di tengah; dikirim ulang dengan aman karena idempoten per mobile_uuid).
 * - Urutan kirim mengikuti dependensi bisnis: absen → penugasan → panen → SPB → rawat →
 *   material → laporan → approval, lalu waktu pembuatan.
 * - Hanya kolom status/meta server yang diperbarui — kolom bisnis tidak pernah disentuh.
 */
import { and, asc, eq, getTableColumns, inArray, isNotNull, ne } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { z } from 'zod';

import {
  txItemSchema,
  txMetaSchema,
  txPayloadSchemas,
  type TxItem,
  type TxTypeName,
} from '../../sync/contract';
import { photo, spbLine, transactionTables, type TransactionType } from '../schema';
import type { AppDatabase } from '../types';

/** Urutan kirim (dependensi: tiket panen butuh absen, SPB butuh tiket, dst.). */
export const TX_PUSH_ORDER: readonly TransactionType[] = [
  'attendance',
  'assignment',
  'harvest_ticket',
  'spb',
  'upkeep',
  'material_usage',
  'daily_report',
  'approval_decision',
];

type Row = Record<string, unknown>;

const shapeKeys = (schema: z.ZodType) => Object.keys((schema as unknown as z.ZodObject).shape);
const META_KEYS = shapeKeys(txMetaSchema).filter((k) => k !== 'app_version');

/** Baris Drizzle (camelCase) → objek bernama kolom DB (snake_case). */
function toDbNames(type: TransactionType, row: Row): Row {
  const out: Row = {};
  for (const [key, col] of Object.entries(getTableColumns(transactionTables[type])) as [string, SQLiteColumn][]) {
    out[col.name] = row[key];
  }
  return out;
}

export interface OutboxEntry {
  type: TransactionType;
  mobileUuid: string;
  item: TxItem;
}

export interface InvalidEntry {
  type: TransactionType;
  mobileUuid: string;
  error: string;
}

/** Bangun item kontrak POST /transactions dari baris lokal. */
export function buildTxItem(
  db: AppDatabase,
  type: TransactionType,
  row: Row,
  appVersion: string,
): { ok: true; item: TxItem } | { ok: false; error: string } {
  const named = toDbNames(type, row);
  const payload: Row = {};
  for (const k of shapeKeys(txPayloadSchemas[type as TxTypeName])) {
    if (k in named) payload[k] = named[k];
  }
  if (type === 'spb') {
    payload.harvest_ticket_uuids = db
      .select({ u: spbLine.harvestTicketUuid })
      .from(spbLine)
      .where(eq(spbLine.spbUuid, String(named.mobile_uuid)))
      .all()
      .map((r) => r.u);
  }
  const meta: Row = { app_version: appVersion };
  for (const k of META_KEYS) meta[k] = named[k];

  const parsed = txItemSchema.safeParse({ type, mobile_uuid: named.mobile_uuid, payload, meta });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, item: parsed.data };
}

/** Ambil antrean siap kirim (maks `limit`) beserta item yang gagal validasi lokal. */
export function collectOutbox(
  db: AppDatabase,
  limit: number,
  appVersion: string,
): { entries: OutboxEntry[]; invalid: InvalidEntry[] } {
  const entries: OutboxEntry[] = [];
  const invalid: InvalidEntry[] = [];
  for (const type of TX_PUSH_ORDER) {
    if (entries.length >= limit) break;
    const table = transactionTables[type];
    const rows = db
      .select()
      .from(table)
      .where(inArray(table.status, ['queued', 'sent']))
      .orderBy(asc(table.createdTrustedAt))
      .limit(limit - entries.length)
      .all() as Row[];
    for (const row of rows) {
      const uuid = String(row.mobileUuid);
      const built = buildTxItem(db, type, row, appVersion);
      if (built.ok) entries.push({ type, mobileUuid: uuid, item: built.item });
      else invalid.push({ type, mobileUuid: uuid, error: built.error });
    }
  }
  return { entries, invalid };
}

/** queued → sent sebelum request dikirim. */
export function markSent(db: AppDatabase, entries: OutboxEntry[], sentAtIso: string): void {
  db.transaction((tx) => {
    for (const type of TX_PUSH_ORDER) {
      const uuids = entries.filter((e) => e.type === type).map((e) => e.mobileUuid);
      if (uuids.length === 0) continue;
      const table = transactionTables[type];
      tx.update(table)
        .set({ status: 'sent', sentAt: sentAtIso })
        .where(and(inArray(table.mobileUuid, uuids), eq(table.status, 'queued')))
        .run();
    }
  });
}

export interface PushResult {
  mobile_uuid: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  server_id?: number | null;
  reason?: string | null;
}

export interface PushSummary {
  accepted: number;
  duplicate: number;
  rejected: number;
  /** Item dikirim tetapi tidak ada di respons (tetap sent, dikirim ulang nanti). */
  missing: number;
}

/** Terapkan hasil POST /transactions. duplicate dianggap sukses (accepted). */
export function applyPushResults(db: AppDatabase, entries: OutboxEntry[], results: PushResult[]): PushSummary {
  const byUuid = new Map(results.map((r) => [r.mobile_uuid, r]));
  const summary: PushSummary = { accepted: 0, duplicate: 0, rejected: 0, missing: 0 };
  db.transaction((tx) => {
    for (const e of entries) {
      const r = byUuid.get(e.mobileUuid);
      const table = transactionTables[e.type];
      const where = and(eq(table.mobileUuid, e.mobileUuid), eq(table.status, 'sent'));
      if (!r) {
        summary.missing++;
        continue;
      }
      if (r.status === 'rejected') {
        tx.update(table).set({ status: 'rejected', rejectReason: r.reason ?? 'ditolak server' }).where(where).run();
        summary.rejected++;
      } else {
        tx.update(table).set({ status: 'accepted', serverId: r.server_id ?? null, rejectReason: null }).where(where).run();
        summary[r.status === 'duplicate' ? 'duplicate' : 'accepted']++;
      }
    }
  });
  return summary;
}

/** Transaksi accepted yang belum posted — untuk polling status. */
export function listAwaitingPost(db: AppDatabase, limit: number): { type: TransactionType; mobileUuid: string }[] {
  const out: { type: TransactionType; mobileUuid: string }[] = [];
  for (const type of TX_PUSH_ORDER) {
    if (out.length >= limit) break;
    const table = transactionTables[type];
    const rows = db
      .select({ u: table.mobileUuid })
      .from(table)
      .where(eq(table.status, 'accepted'))
      .limit(limit - out.length)
      .all();
    out.push(...rows.map((r) => ({ type, mobileUuid: r.u })));
  }
  return out;
}

export interface StatusResult {
  mobile_uuid: string;
  status: 'accepted' | 'rejected' | 'posted' | 'unknown';
  reason?: string | null;
  posted_at?: string | null;
}

export function applyStatusResults(
  db: AppDatabase,
  awaiting: { type: TransactionType; mobileUuid: string }[],
  results: StatusResult[],
): { posted: number; rejected: number } {
  const typeOf = new Map(awaiting.map((a) => [a.mobileUuid, a.type]));
  let posted = 0;
  let rejected = 0;
  db.transaction((tx) => {
    for (const r of results) {
      const type = typeOf.get(r.mobile_uuid);
      if (!type) continue;
      const table = transactionTables[type];
      const where = and(eq(table.mobileUuid, r.mobile_uuid), eq(table.status, 'accepted'));
      if (r.status === 'posted') {
        tx.update(table).set({ status: 'posted', postedAt: r.posted_at ?? null }).where(where).run();
        posted++;
      } else if (r.status === 'rejected') {
        tx.update(table).set({ status: 'rejected', rejectReason: r.reason ?? 'ditolak saat posting' }).where(where).run();
        rejected++;
      }
    }
  });
  return { posted, rejected };
}

export interface RejectedRow {
  type: TransactionType;
  mobileUuid: string;
  reason: string;
  createdTrustedAt: string;
}

/** Transaksi ditolak yang belum punya koreksi — tampil di layar Sinkron. */
export function listRejected(db: AppDatabase, limit = 50): RejectedRow[] {
  const out: RejectedRow[] = [];
  for (const type of TX_PUSH_ORDER) {
    const table = transactionTables[type];
    const rows = db
      .select({ u: table.mobileUuid, reason: table.rejectReason, at: table.createdTrustedAt })
      .from(table)
      .where(eq(table.status, 'rejected'))
      .all();
    const corrected = new Set(
      db
        .select({ c: table.correctionOf })
        .from(table)
        .where(isNotNull(table.correctionOf))
        .all()
        .map((r) => r.c),
    );
    for (const r of rows) {
      if (!corrected.has(r.u)) out.push({ type, mobileUuid: r.u, reason: r.reason ?? '', createdTrustedAt: r.at });
    }
  }
  return out.sort((a, b) => b.createdTrustedAt.localeCompare(a.createdTrustedAt)).slice(0, limit);
}

// ---- Foto ------------------------------------------------------------------

export type PhotoRow = typeof photo.$inferSelect;

/**
 * Foto siap unggah: belum uploaded, sudah ditautkan ke transaksi, dan transaksinya sudah
 * diterima server (foto tidak berguna untuk transaksi yang belum ada di server).
 */
export function listPendingPhotos(db: AppDatabase, limit: number): PhotoRow[] {
  const candidates = db
    .select()
    .from(photo)
    .where(and(ne(photo.uploadStatus, 'uploaded'), isNotNull(photo.transactionUuid)))
    .limit(limit * 4)
    .all();
  const ready: PhotoRow[] = [];
  for (const p of candidates) {
    if (ready.length >= limit) break;
    if (isTransactionKnownToServer(db, p.transactionUuid!)) ready.push(p);
  }
  return ready;
}

function isTransactionKnownToServer(db: AppDatabase, uuid: string): boolean {
  for (const type of TX_PUSH_ORDER) {
    const table = transactionTables[type];
    const row = db.select({ s: table.status }).from(table).where(eq(table.mobileUuid, uuid)).get();
    if (row) return row.s === 'accepted' || row.s === 'posted' || row.s === 'rejected';
  }
  return false;
}

export function markPhoto(
  db: AppDatabase,
  id: string,
  status: PhotoRow['uploadStatus'],
  serverPhotoId?: number,
): void {
  db.update(photo)
    .set(serverPhotoId != null ? { uploadStatus: status, serverPhotoId } : { uploadStatus: status })
    .where(eq(photo.id, id))
    .run();
}
