/**
 * Outbox transaksi untuk sync engine.
 *
 * - Antrean = status queued + sent (sent = sudah dikirim tetapi hasilnya belum pasti, mis.
 *   koneksi putus di tengah; dikirim ulang dengan aman karena idempoten per mobile_uuid).
 * - Urutan kirim mengikuti dependensi bisnis: absen → penugasan → panen → lanjutkan tahap tiket → SPB →
 *   pemupukan → perawatan → rawat & material (versi lama) → inspeksi → tindak lanjut temuan → laporan →
 *   approval, lalu waktu pembuatan.
 * - Hanya kolom status/meta server yang diperbarui — kolom bisnis tidak pernah disentuh.
 */
import { and, asc, eq, getTableColumns, gte, inArray, isNotNull, ne } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { z } from 'zod';

import {
  txItemSchema,
  txMetaSchema,
  txPayloadSchemas,
  type TxDocument,
  type TxItem,
  type TxTypeName,
} from '../../sync/contract';
import {
  fertilizationTicket,
  harvestTicket,
  inspectionFinding,
  maintenanceTicket,
  photo,
  spb,
  spbLine,
  transactionTables,
  txDocument,
  type TransactionType,
} from '../schema';
import type { AppDatabase } from '../types';
import { FINAL_DOCUMENT_STATES, upsertDocument } from './documents';

/** Urutan kirim (dependensi: tiket panen butuh absen, SPB butuh tiket, dst.). */
export const TX_PUSH_ORDER: readonly TransactionType[] = [
  'attendance',
  'assignment',
  'harvest_ticket',
  'fertilization_ticket',
  'maintenance_ticket',
  // Sesudah tiket panen, pemupukan, dan perawatan: Simpan & Lanjutkan merujuk tiket yang dikirim di batch yang sama.
  'stage_confirm',
  'spb',
  'upkeep',
  'material_usage',
  // Seperti di server: setelah material, sebelum laporan; tindak lanjut sesudah inspeksi yang membuat temuannya.
  'inspection',
  'inspection_followup',
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
    const lines = db.select().from(spbLine).where(eq(spbLine.spbUuid, String(named.mobile_uuid))).all();
    payload.harvest_ticket_uuids = lines.map((l) => l.harvestTicketUuid);
    // Muatan per tiket (baris SPB ERP). Bila ada muatan yang tidak lengkap (SPB versi lama, brondolan
    // dari QR lama tidak diketahui), muatan tidak dikirim dan ERP memuat tiket utuh.
    if (lines.every((l) => l.bunchCount != null && l.looseFruitKg != null)) {
      payload.lines = lines.map((l) => ({
        ticket_uuid: l.harvestTicketUuid,
        bunch_count: l.bunchCount,
        loose_fruit_kg: l.looseFruitKg,
      }));
    }
  }
  if (type === 'inspection') {
    payload.findings = db
      .select()
      .from(inspectionFinding)
      .where(eq(inspectionFinding.inspectionUuid, String(named.mobile_uuid)))
      .all()
      .map((f) => ({
        finding_uuid: f.findingUuid,
        item_id: f.itemId,
        category: f.category,
        severity: f.severity,
        description: f.description,
        row_no: f.rowNo,
        tree_no: f.treeNo,
        palm_tree_qr: f.palmTreeQr,
        lat: f.lat,
        lng: f.lng,
        photo_ids: f.photoIds,
      }));
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

/**
 * Transaksi yang statusnya ditanyakan ke server: yang masih `accepted`, ditambah tiket panen / SPB /
 * tiket pemupukan / tiket perawatan `posted` sejak `watchSince` (YYYY-MM-DD) yang dokumen ERP-nya belum berstatus akhir.
 */
export function listAwaitingPost(
  db: AppDatabase,
  limit: number,
  watchSince?: string,
): { type: TransactionType; mobileUuid: string }[] {
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
  if (watchSince) {
    const watched = {
      harvest_ticket: harvestTicket,
      spb,
      fertilization_ticket: fertilizationTicket,
      maintenance_ticket: maintenanceTicket,
    } as const;
    for (const type of Object.keys(watched) as (keyof typeof watched)[]) {
      const table = watched[type];
      const rows = db
        .select({ u: table.mobileUuid, state: txDocument.state })
        .from(table)
        .leftJoin(txDocument, eq(txDocument.mobileUuid, table.mobileUuid))
        .where(and(eq(table.status, 'posted'), gte(table.workDate, watchSince)))
        .all();
      for (const r of rows) {
        if (out.length >= limit) break;
        if (!r.state || !FINAL_DOCUMENT_STATES[type].includes(r.state)) out.push({ type, mobileUuid: r.u });
      }
    }
  }
  return out;
}

export interface StatusResult {
  mobile_uuid: string;
  status: 'accepted' | 'rejected' | 'posted' | 'unknown';
  reason?: string | null;
  posted_at?: string | null;
  post_error?: string | null;
  document?: TxDocument | null;
}

export function applyStatusResults(
  db: AppDatabase,
  awaiting: { type: TransactionType; mobileUuid: string }[],
  results: StatusResult[],
  nowIso: string = new Date().toISOString(),
): { posted: number; rejected: number } {
  const typeOf = new Map(awaiting.map((a) => [a.mobileUuid, a.type]));
  let posted = 0;
  let rejected = 0;
  db.transaction((tx) => {
    for (const r of results) {
      const type = typeOf.get(r.mobile_uuid);
      if (!type) continue;
      if (r.document) upsertDocument(tx as unknown as AppDatabase, r.mobile_uuid, r.document, nowIso);
      const table = transactionTables[type];
      const where = and(eq(table.mobileUuid, r.mobile_uuid), eq(table.status, 'accepted'));
      if (r.status === 'posted') {
        tx.update(table).set({ status: 'posted', postedAt: r.posted_at ?? null, rejectReason: null }).where(where).run();
        posted++;
      } else if (r.status === 'accepted') {
        // Gagal posting disimpan di kolom alasan selama masih diterima; hilang saat terposting.
        tx.update(table).set({ rejectReason: r.post_error ?? null }).where(where).run();
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
