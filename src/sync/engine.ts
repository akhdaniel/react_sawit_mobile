/**
 * Sync engine — SATU-SATUNYA tempat aplikasi memanggil API.
 *
 * Urutan: push transaksi → unggah foto → polling status → tarik master (delta cursor) →
 * rencana kerja hari ini → heartbeat. Push didahulukan agar data lapangan secepatnya keluar
 * dari HP. Error jaringan/autentikasi menghentikan langkah berikutnya; error server pada satu
 * langkah dicatat lalu langkah lain tetap dicoba.
 */
import { getPendingSummary } from '../db/repositories/pending';
import { replaceInbox, type InboxItem } from '../db/repositories/approval';
import { applyMasterChanges, getCursor, upsertWorkPlans } from '../db/repositories/master';
import { getMeta, META_KEYS, setMeta } from '../db/repositories/meta';
import {
  applyPushResults,
  applyStatusResults,
  collectOutbox,
  listAwaitingPost,
  listPendingPhotos,
  markPhoto,
  markSent,
  type InvalidEntry,
  type PhotoRow,
  type PushResult,
  type StatusResult,
} from '../db/repositories/outbox';
import type { AppDatabase } from '../db/types';
import { AuthRequiredError } from './api-client';
import type { MasterRecord, MasterResponse, TxItem } from './contract';
import { MAX_TX_BATCH } from './contract';
import { ApiError, NetworkError } from './http';

export interface SyncApi {
  getMaster(since: string | null): Promise<MasterResponse>;
  getWorkplan(date: string): Promise<{ items: MasterRecord<'work_plan'>[] }>;
  postTransactions(items: TxItem[]): Promise<{ results: PushResult[] }>;
  getStatus(ids: string[]): Promise<{ results: StatusResult[] }>;
  uploadPhoto(photo: PhotoRow): Promise<{ photo_id: number }>;
  heartbeat(body: { app_version: string; battery: number | null; pending_count: number; last_sync_at: string | null }): Promise<void>;
  getApprovals(afdelingId: number): Promise<{ items: InboxItem[] }>;
}

export type SyncStep = 'push' | 'photos' | 'status' | 'master' | 'workplan' | 'approvals' | 'heartbeat';
export const SYNC_STEPS: readonly SyncStep[] = ['push', 'photos', 'status', 'master', 'workplan', 'approvals', 'heartbeat'];

export type SyncErrorKind = 'offline' | 'auth' | 'server' | 'unknown';

export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  push: { sent: number; accepted: number; duplicate: number; rejected: number; invalid: InvalidEntry[] };
  photos: { uploaded: number; failed: number; missingFile: number };
  status: { checked: number; posted: number; rejected: number };
  master: { pages: number; upserted: number; deleted: number };
  workplan: { items: number };
  approvals: { items: number };
  /** Error yang menghentikan sinkron (offline/auth) atau error per langkah. */
  errors: { step: SyncStep; kind: SyncErrorKind; message: string }[];
}

export interface SyncDeps {
  db: AppDatabase;
  api: SyncApi;
  /** ISO trusted time. */
  nowIso(): string;
  workDate(): string;
  appVersion: string;
  battery(): Promise<number | null>;
  photoFileExists(localUri: string): boolean;
  onStep?(step: SyncStep): void;
  /** Afdeling yang inbox approval-nya ditarik (hanya untuk peran asisten). */
  approvalAfdelingIds?: number[];
  batchSize?: number;
  statusChunk?: number;
  photoLimit?: number;
  maxMasterPages?: number;
}

export function classifyError(err: unknown): SyncErrorKind {
  if (err instanceof NetworkError) return 'offline';
  if (err instanceof AuthRequiredError) return 'auth';
  if (err instanceof ApiError) return 'server';
  return 'unknown';
}

class FatalSyncError extends Error {}

function emptyResult(startedAt: string): SyncResult {
  return {
    startedAt,
    finishedAt: startedAt,
    ok: false,
    push: { sent: 0, accepted: 0, duplicate: 0, rejected: 0, invalid: [] },
    photos: { uploaded: 0, failed: 0, missingFile: 0 },
    status: { checked: 0, posted: 0, rejected: 0 },
    master: { pages: 0, upserted: 0, deleted: 0 },
    workplan: { items: 0 },
    approvals: { items: 0 },
    errors: [],
  };
}

async function pushTransactions(d: SyncDeps, r: SyncResult): Promise<void> {
  const batch = Math.min(d.batchSize ?? MAX_TX_BATCH, MAX_TX_BATCH);
  // Batasi putaran agar item yang tidak pernah dijawab server tidak memutar tanpa akhir.
  for (let round = 0; round < 50; round++) {
    const { entries, invalid } = collectOutbox(d.db, batch, d.appVersion);
    if (round === 0) r.push.invalid = invalid;
    if (entries.length === 0) return;
    markSent(d.db, entries, d.nowIso());
    let results: PushResult[];
    try {
      results = (await d.api.postTransactions(entries.map((e) => e.item))).results;
    } catch (err) {
      // 409 untuk seluruh batch = semua sudah ada di server → anggap sukses.
      if (err instanceof ApiError && err.status === 409) {
        results = entries.map((e) => ({ mobile_uuid: e.mobileUuid, status: 'duplicate' as const }));
      } else throw err;
    }
    const s = applyPushResults(d.db, entries, results);
    r.push.sent += entries.length;
    r.push.accepted += s.accepted;
    r.push.duplicate += s.duplicate;
    r.push.rejected += s.rejected;
    if (s.missing === entries.length) return; // server tidak menjawab satu pun → coba lagi nanti
    if (entries.length < batch) return;
  }
}

async function uploadPhotos(d: SyncDeps, r: SyncResult): Promise<void> {
  const photos = listPendingPhotos(d.db, d.photoLimit ?? 50);
  for (const p of photos) {
    if (!d.photoFileExists(p.localUri)) {
      markPhoto(d.db, p.id, 'failed');
      r.photos.missingFile++;
      continue;
    }
    markPhoto(d.db, p.id, 'uploading');
    try {
      const res = await d.api.uploadPhoto(p);
      markPhoto(d.db, p.id, 'uploaded', res.photo_id);
      r.photos.uploaded++;
    } catch (err) {
      const kind = classifyError(err);
      // Gagal jaringan/auth → kembali pending; ditolak server (mis. hash tidak cocok) → failed.
      markPhoto(d.db, p.id, kind === 'server' && err instanceof ApiError && err.status < 500 ? 'failed' : 'pending');
      if (kind === 'offline' || kind === 'auth') throw err;
      r.photos.failed++;
    }
  }
}

async function pollStatus(d: SyncDeps, r: SyncResult): Promise<void> {
  const chunk = d.statusChunk ?? 100;
  const awaiting = listAwaitingPost(d.db, 2000);
  for (let i = 0; i < awaiting.length; i += chunk) {
    const part = awaiting.slice(i, i + chunk);
    const res = await d.api.getStatus(part.map((a) => a.mobileUuid));
    const s = applyStatusResults(d.db, part, res.results);
    r.status.checked += part.length;
    r.status.posted += s.posted;
    r.status.rejected += s.rejected;
  }
}

async function pullMaster(d: SyncDeps, r: SyncResult): Promise<void> {
  const maxPages = d.maxMasterPages ?? 100;
  for (let page = 0; page < maxPages; page++) {
    const res = await d.api.getMaster(getCursor(d.db));
    const s = applyMasterChanges(d.db, res.changes, res.cursor);
    r.master.pages++;
    r.master.upserted += s.upserted;
    r.master.deleted += s.deleted;
    if (!res.has_more) return;
  }
}

async function pullWorkplan(d: SyncDeps, r: SyncResult): Promise<void> {
  const res = await d.api.getWorkplan(d.workDate());
  r.workplan.items = upsertWorkPlans(d.db, res.items);
}

async function pullApprovals(d: SyncDeps, r: SyncResult): Promise<void> {
  for (const afd of d.approvalAfdelingIds ?? []) {
    const res = await d.api.getApprovals(afd);
    replaceInbox(d.db, afd, res.items, d.nowIso());
    r.approvals.items += res.items.length;
  }
}

async function sendHeartbeat(d: SyncDeps): Promise<void> {
  await d.api.heartbeat({
    app_version: d.appVersion,
    battery: await d.battery().catch(() => null),
    pending_count: getPendingSummary(d.db).total,
    last_sync_at: getMeta(d.db, META_KEYS.lastSyncAt),
  });
}

export async function runSync(d: SyncDeps): Promise<SyncResult> {
  const r = emptyResult(d.nowIso());
  const steps: [SyncStep, () => Promise<void>][] = [
    ['push', () => pushTransactions(d, r)],
    ['photos', () => uploadPhotos(d, r)],
    ['status', () => pollStatus(d, r)],
    ['master', () => pullMaster(d, r)],
    ['workplan', () => pullWorkplan(d, r)],
    ['approvals', () => pullApprovals(d, r)],
    ['heartbeat', () => sendHeartbeat(d)],
  ];
  try {
    for (const [step, fn] of steps) {
      d.onStep?.(step);
      try {
        await fn();
      } catch (err) {
        const kind = classifyError(err);
        r.errors.push({ step, kind, message: err instanceof Error ? err.message : String(err) });
        if (kind === 'offline' || kind === 'auth') throw new FatalSyncError();
      }
    }
  } catch (err) {
    if (!(err instanceof FatalSyncError)) throw err;
  }
  r.finishedAt = d.nowIso();
  r.ok = r.errors.length === 0;
  if (!r.errors.some((e) => e.kind === 'offline' || e.kind === 'auth')) {
    setMeta(d.db, META_KEYS.lastSyncAt, r.finishedAt);
  }
  setMeta(d.db, META_KEYS.lastSyncResult, JSON.stringify(r));
  return r;
}

let running: Promise<SyncResult> | null = null;

/** Single-flight: panggilan saat sinkron berjalan mendapat promise yang sama. */
export function syncNow(d: SyncDeps): Promise<SyncResult> {
  running ??= runSync(d).finally(() => {
    running = null;
  });
  return running;
}

export function isSyncRunning(): boolean {
  return running != null;
}
