/**
 * Integrasi ujung-ke-ujung: sync engine aplikasi + DB SQLite (skema & migrasi yang sama
 * dengan HP, tanpa SQLCipher) + ApiClient sungguhan ↔ mock server.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '../../src/db/schema';
import type { AppDatabase } from '../../src/db/types';
import { MemoryKV } from '../../src/lib/secure-kv';
import { createSyncApi } from '../../src/sync/api';
import { ApiClient, TokenStore } from '../../src/sync/api-client';
import { runSync, type SyncDeps } from '../../src/sync/engine';
import { HttpClient } from '../../src/sync/http';
import { API_PREFIX, createApp } from './app';
import { jakartaDate, TEST_PASSWORD } from './seed';
import { Store } from './store';

let serverNow = Date.parse('2026-10-18T02:00:00Z');
const store = new Store({ now: () => serverNow, postDelayMs: 60_000 });
const today = jakartaDate(new Date(serverNow));
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let baseUrl = '';

before(async () => {
  server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${API_PREFIX}`;
});
after(() => server.close());

function createDb(): AppDatabase {
  const db = drizzle(new Database(':memory:'), { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../../src/db/migrations') });
  return db as unknown as AppDatabase;
}

const photoBytes = Buffer.from('foto-jpeg-palsu');
const photoSha = createHash('sha256').update(photoBytes).digest('hex');

async function client() {
  const kv = new MemoryKV();
  const http = new HttpClient({ baseUrl: () => baseUrl, retries: 0 });
  const api = new ApiClient(http, new TokenStore(kv), () => serverNow);
  const login = await api.login({
    login: 'mandor.panen',
    password: TEST_PASSWORD,
    device_id: 'and-sync-it',
    device_model: 'node',
    app_version: '0.3.0',
  });
  await api.tokens.save(login, serverNow);
  const syncApi = createSyncApi(api, () => new Blob([new Uint8Array(photoBytes)], { type: 'image/jpeg' }));
  return { userId: login.user.id, syncApi };
}

const common = (userId: number) => ({
  userId,
  deviceId: 'and-sync-it',
  createdTrustedAt: new Date(serverNow).toISOString(),
  deviceTimeAt: new Date(serverNow).toISOString(),
  timeSource: 'server' as const,
  lat: 0.51,
  lng: 101.41,
  accuracyM: 5,
  mocked: false,
  rooted: false,
  status: 'queued' as const,
});

describe('sync engine ↔ mock server', () => {
  it('push berurutan, foto, polling posted, master + workplan, refresh token', async () => {
    const db = createDb();
    const { userId, syncApi } = await client();
    const deps: SyncDeps = {
      db,
      api: syncApi,
      nowIso: () => new Date(serverNow).toISOString(),
      workDate: () => today,
      appVersion: '0.3.0',
      battery: async () => 0.5,
      photoFileExists: () => true,
    };

    const bjr = store.getMaster<{ id: number; bjr_kg: number }>('block', 1)!.bjr_kg;
    const att = { ...common(userId), mobileUuid: randomUUID(), workDate: today, employeeId: 2, gangId: 2, type: 'check_in' as const, attStatus: 'hadir' as const };
    const okTicket = {
      ...common(userId),
      mobileUuid: randomUUID(),
      workDate: today,
      ticketNo: `AFD01-${today.slice(2).replaceAll('-', '')}-AB12-0001`,
      tphId: 1,
      blockId: 1,
      harvesterEmployeeId: 2,
      ripe: 12,
      estKg: 12 * bjr,
    };
    const noCheckIn = { ...okTicket, mobileUuid: randomUUID(), ticketNo: okTicket.ticketNo.replace(/0001$/, '0002'), harvesterEmployeeId: 3 };
    // Dibuat lebih dulu dari absen, tetapi tetap dikirim setelahnya karena urutan dependensi.
    db.insert(schema.harvestTicket).values({ ...okTicket, createdTrustedAt: '2026-10-18T00:00:00.000Z' }).run();
    db.insert(schema.harvestTicket).values(noCheckIn).run();
    db.insert(schema.attendance).values(att).run();
    const photoId = randomUUID();
    db.insert(schema.photo)
      .values({ id: photoId, transactionUuid: okTicket.mobileUuid, localUri: 'file:///x.jpg', sha256: photoSha, sizeBytes: photoBytes.length, takenTrustedAt: new Date(serverNow).toISOString() })
      .run();

    const r1 = await runSync(deps);
    assert.deepEqual(r1.errors, []);
    assert.equal(r1.push.accepted, 2);
    assert.equal(r1.push.rejected, 1);
    const ticket = (uuid: string) => db.select().from(schema.harvestTicket).where(eq(schema.harvestTicket.mobileUuid, uuid)).get()!;
    assert.equal(ticket(okTicket.mobileUuid).status, 'accepted');
    assert.ok(ticket(okTicket.mobileUuid).serverId);
    assert.equal(ticket(noCheckIn.mobileUuid).status, 'rejected');
    assert.equal(ticket(noCheckIn.mobileUuid).rejectReason, 'no_check_in');
    assert.equal(db.select().from(schema.photo).get()!.uploadStatus, 'uploaded');
    assert.equal(store.photos.get(photoId)?.transactionUuid, okTicket.mobileUuid);
    assert.equal(db.select().from(schema.block).all().length, 40);
    assert.equal(db.select().from(schema.employee).all().length, 200);
    assert.ok(db.select().from(schema.workPlan).all().some((w) => w.date === today));
    assert.equal(store.heartbeats.get('and-sync-it')?.pending_count, 0);

    // Jeda posting lewat + token dicabut → refresh otomatis, status jadi posted.
    serverNow += 61_000;
    store.expireAllAccessTokens();
    store.patchMaster('block', 1, { bjr_kg: 21 });
    const r2 = await runSync(deps);
    assert.deepEqual(r2.errors, []);
    assert.equal(r2.status.posted, 2);
    assert.equal(ticket(okTicket.mobileUuid).status, 'posted');
    assert.equal(r2.master.upserted, 1);
    assert.equal(db.select().from(schema.block).where(eq(schema.block.id, 1)).get()!.bjrKg, 21);

    // Kirim ulang (mis. respons hilang sebelumnya) → duplicate, tidak menggandakan.
    const before = store.transactions.size;
    const resend = await syncApi.postTransactions([
      { type: 'attendance', mobile_uuid: att.mobileUuid, payload: { work_date: today, employee_id: 2, gang_id: 2, type: 'check_in', att_status: 'hadir', late_reason: null, photo_id: null, outside_afdeling: false }, meta: { user_id: userId, device_id: 'and-sync-it', created_trusted_at: att.createdTrustedAt, device_time_at: att.deviceTimeAt, time_source: 'server', lat: 0.51, lng: 101.41, accuracy_m: 5, mocked: false, rooted: false, correction_of: null } },
    ]);
    assert.equal(resend.results[0]!.status, 'duplicate');
    assert.equal(store.transactions.size, before);
  });

  it('server mati → offline, data tetap di antrean', async () => {
    const db = createDb();
    const { userId, syncApi } = await client();
    db.insert(schema.attendance)
      .values({ ...common(userId), mobileUuid: randomUUID(), workDate: today, employeeId: 4, gangId: 4, type: 'check_in', attStatus: 'hadir' })
      .run();
    const saved = baseUrl;
    baseUrl = 'http://127.0.0.1:1/xsm/v1';
    try {
      const r = await runSync({
        db,
        api: syncApi,
        nowIso: () => new Date(serverNow).toISOString(),
        workDate: () => today,
        appVersion: '0.3.0',
        battery: async () => null,
        photoFileExists: () => true,
      });
      assert.equal(r.errors[0]?.kind, 'offline');
      assert.equal(db.select().from(schema.attendance).get()!.status, 'sent');
    } finally {
      baseUrl = saved;
    }
  });
});
