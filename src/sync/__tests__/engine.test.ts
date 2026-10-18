import { eq } from 'drizzle-orm';

import { pendingInbox } from '@/db/repositories/approval';
import { getCursor } from '@/db/repositories/master';
import { getMeta } from '@/db/repositories/meta';
import { attendance, block, harvestTicket, photo, workPlan } from '@/db/schema';
import { AuthRequiredError } from '@/sync/api-client';
import type { MasterResponse } from '@/sync/contract';
import { runSync, syncNow, type SyncApi, type SyncDeps } from '@/sync/engine';
import { ApiError, NetworkError } from '@/sync/http';
import { createTestDb } from '@/test/db';
import { attendanceRow, harvestTicketRow, photoRow } from '@/test/fixtures';

const ST = '2026-10-18T09:00:00.000Z';
const blk = (id: number) => ({ id, code: `B${id}`, afdeling_id: 1, ha: 30, planting_year: 2010, status: 'TM' as const, bjr_kg: 18.5, polygon_geojson: null });
const masterPage = (cursor: string, ids: number[], has_more = false): MasterResponse => ({
  cursor,
  server_time: ST,
  has_more,
  changes: { block: { upserts: ids.map(blk), deletes: [] } },
});

function fakeApi(over: Partial<SyncApi> = {}) {
  const calls: string[] = [];
  const api: SyncApi = {
    async postTransactions(items) {
      calls.push(`push:${items.length}`);
      return { results: items.map((i, n) => ({ mobile_uuid: i.mobile_uuid, status: 'accepted' as const, server_id: n + 1 })) };
    },
    async uploadPhoto() {
      calls.push('photo');
      return { photo_id: 99 };
    },
    async getStatus(ids) {
      calls.push(`status:${ids.length}`);
      return { results: ids.map((id) => ({ mobile_uuid: id, status: 'accepted' as const })) };
    },
    async getMaster(since) {
      calls.push(`master:${since ?? ''}`);
      return masterPage('v1', [1, 2]);
    },
    async getWorkplan(date) {
      calls.push(`workplan:${date}`);
      return { items: [{ id: 5, date, afdeling_id: 1, block_id: 1, activity_id: 1, gang_id: 1, target_ha: 10, target_bunch: 100 }] };
    },
    async heartbeat(body) {
      calls.push(`heartbeat:${body.pending_count}`);
    },
    async getApprovals(afd) {
      calls.push(`approvals:${afd}`);
      return { items: [{ target_uuid: '11111111-2222-4333-8444-555555555555', target_type: 'attendance', summary: 'x', flags: ['outside_afdeling'] }] };
    },
    ...over,
  };
  return { api, calls };
}

function deps(db: SyncDeps['db'], api: SyncApi, over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    db,
    api,
    nowIso: () => ST,
    workDate: () => '2026-10-18',
    appVersion: '0.3.0',
    battery: async () => 0.8,
    photoFileExists: () => true,
    ...over,
  };
}

describe('runSync', () => {
  it('alur lengkap: push → foto → status → master → workplan → heartbeat', async () => {
    const { db } = createTestDb();
    const att = attendanceRow();
    db.insert(attendance).values(att).run();
    db.insert(harvestTicket).values(harvestTicketRow()).run();
    db.insert(photo).values(photoRow({ transactionUuid: att.mobileUuid })).run();
    const { api, calls } = fakeApi();
    const steps: string[] = [];
    const r = await runSync(deps(db, api, { onStep: (s) => steps.push(s) }));

    expect(r.ok).toBe(true);
    expect(steps).toEqual(['push', 'photos', 'status', 'master', 'workplan', 'approvals', 'heartbeat']);
    expect(calls).toEqual(['push:2', 'photo', 'status:2', 'master:', 'workplan:2026-10-18', 'heartbeat:0']);
    expect(r.push).toMatchObject({ sent: 2, accepted: 2 });
    expect(db.select().from(attendance).get()?.status).toBe('accepted');
    expect(db.select().from(photo).get()).toMatchObject({ uploadStatus: 'uploaded', serverPhotoId: 99 });
    expect(db.select().from(block).all()).toHaveLength(2);
    expect(db.select().from(workPlan).all()).toHaveLength(1);
    expect(getCursor(db)).toBe('v1');
    expect(getMeta(db, 'last_sync_at')).toBe(ST);
    expect(JSON.parse(getMeta(db, 'last_sync_result')!).ok).toBe(true);
  });

  it('asisten: inbox approval ditarik per afdeling dan disimpan lokal', async () => {
    const { db } = createTestDb();
    const { api, calls } = fakeApi();
    const r = await runSync(deps(db, api, { approvalAfdelingIds: [1, 2] }));
    expect(calls.filter((c) => c.startsWith('approvals'))).toEqual(['approvals:1', 'approvals:2']);
    expect(r.approvals.items).toBe(2);
    expect(pendingInbox(db)).toHaveLength(1); // target sama → satu baris (afdeling terakhir)
  });

  it('offline: berhenti di langkah pertama, data tetap sent untuk dikirim ulang, last_sync_at tidak berubah', async () => {
    const { db } = createTestDb();
    db.insert(attendance).values(attendanceRow()).run();
    const { api, calls } = fakeApi({
      postTransactions: async () => {
        throw new NetworkError('Network request failed');
      },
    });
    const r = await runSync(deps(db, api));
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([{ step: 'push', kind: 'offline', message: 'Network request failed' }]);
    expect(calls).toEqual([]);
    expect(db.select().from(attendance).get()?.status).toBe('sent');
    expect(getMeta(db, 'last_sync_at')).toBeNull();

    // koneksi kembali → item sent terkirim ulang dan diterima
    const ok = await runSync(deps(db, fakeApi().api));
    expect(ok.push.accepted).toBe(1);
    expect(db.select().from(attendance).get()?.status).toBe('accepted');
  });

  it('token habis → errors auth, langkah lain dilewati', async () => {
    const { db } = createTestDb();
    const { api } = fakeApi({
      postTransactions: async () => {
        throw new AuthRequiredError();
      },
      getMaster: async () => {
        throw new Error('tidak boleh dipanggil');
      },
    });
    db.insert(attendance).values(attendanceRow()).run();
    const r = await runSync(deps(db, api));
    expect(r.errors.map((e) => e.kind)).toEqual(['auth']);
  });

  it('error server di satu langkah tidak menghentikan langkah lain', async () => {
    const { db } = createTestDb();
    const { api, calls } = fakeApi({
      getMaster: async () => {
        throw new ApiError(500, 'internal_error', 'kesalahan server');
      },
    });
    const r = await runSync(deps(db, api));
    expect(r.errors).toEqual([{ step: 'master', kind: 'server', message: 'kesalahan server' }]);
    expect(calls).toContain('workplan:2026-10-18');
    expect(calls).toContain('heartbeat:0');
    expect(getMeta(db, 'last_sync_at')).toBe(ST);
  });

  it('409 untuk seluruh batch dianggap duplicate (sukses)', async () => {
    const { db } = createTestDb();
    db.insert(attendance).values(attendanceRow()).run();
    const { api } = fakeApi({
      postTransactions: async () => {
        throw new ApiError(409, 'duplicate', 'sudah ada');
      },
    });
    const r = await runSync(deps(db, api));
    expect(r.push.duplicate).toBe(1);
    expect(db.select().from(attendance).get()?.status).toBe('accepted');
  });

  it('memecah antrean menjadi beberapa batch', async () => {
    const { db } = createTestDb();
    for (let i = 0; i < 7; i++) db.insert(harvestTicket).values(harvestTicketRow({ ticketNo: `AFD01-261018-AB12-${String(i + 1).padStart(4, '0')}` })).run();
    const { api, calls } = fakeApi();
    const r = await runSync(deps(db, api, { batchSize: 3 }));
    expect(calls.filter((c) => c.startsWith('push'))).toEqual(['push:3', 'push:3', 'push:1']);
    expect(r.push.accepted).toBe(7);
  });

  it('server tidak menjawab item → tetap sent, tidak berputar tanpa akhir', async () => {
    const { db } = createTestDb();
    for (let i = 0; i < 3; i++) db.insert(harvestTicket).values(harvestTicketRow({ ticketNo: `AFD01-261018-AB12-000${i + 1}` })).run();
    const { api, calls } = fakeApi({
      postTransactions: async () => {
        calls.push('push');
        return { results: [] };
      },
    });
    await runSync(deps(db, api, { batchSize: 3 }));
    expect(calls.filter((c) => c === 'push')).toHaveLength(1);
    expect(db.select().from(harvestTicket).all().every((t) => t.status === 'sent')).toBe(true);
  });

  it('master berhalaman mengikuti has_more dan cursor', async () => {
    const { db } = createTestDb();
    const pages = [masterPage('v1', [1, 2], true), masterPage('v2', [3], true), masterPage('v3', [4], false)];
    const sinces: (string | null)[] = [];
    const { api } = fakeApi({
      getMaster: async (since) => {
        sinces.push(since);
        return pages.shift()!;
      },
    });
    const r = await runSync(deps(db, api));
    expect(sinces).toEqual([null, 'v1', 'v2']);
    expect(r.master).toEqual({ pages: 3, upserted: 4, deleted: 0 });
  });

  it('foto: file hilang → failed; ditolak server (422) → failed; gangguan jaringan → pending', async () => {
    const { db } = createTestDb();
    const tx = harvestTicketRow({ status: 'accepted' });
    db.insert(harvestTicket).values(tx).run();
    const missing = photoRow({ transactionUuid: tx.mobileUuid, localUri: 'file:///hilang.jpg' });
    const bad = photoRow({ transactionUuid: tx.mobileUuid });
    db.insert(photo).values([missing, bad]).run();
    const { api } = fakeApi({
      uploadPhoto: async () => {
        throw new ApiError(422, 'sha256_mismatch', 'hash tidak cocok');
      },
    });
    const r = await runSync(deps(db, api, { photoFileExists: (u) => u !== 'file:///hilang.jpg' }));
    expect(r.photos).toEqual({ uploaded: 0, failed: 1, missingFile: 1 });
    const status = (id: string) => db.select().from(photo).where(eq(photo.id, id)).get()?.uploadStatus;
    expect(status(missing.id)).toBe('failed');
    expect(status(bad.id)).toBe('failed');

    const { db: db2 } = createTestDb();
    db2.insert(harvestTicket).values(tx).run();
    db2.insert(photo).values(bad).run();
    const offline = fakeApi({
      uploadPhoto: async () => {
        throw new NetworkError('putus');
      },
    });
    const r2 = await runSync(deps(db2, offline.api));
    expect(r2.errors[0]).toMatchObject({ step: 'photos', kind: 'offline' });
    expect(db2.select().from(photo).get()?.uploadStatus).toBe('pending');
  });

  it('syncNow single-flight', async () => {
    const { db } = createTestDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { api, calls } = fakeApi({
      getMaster: async () => {
        await gate;
        calls.push('master');
        return masterPage('v1', []);
      },
    });
    const a = syncNow(deps(db, api));
    const b = syncNow(deps(db, api));
    expect(a).toBe(b);
    release();
    await a;
    expect(calls.filter((c) => c === 'master')).toHaveLength(1);
  });
});
