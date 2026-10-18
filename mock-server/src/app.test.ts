import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  approvalsResponseSchema,
  authTokenResponseSchema,
  errorResponseSchema,
  MASTER_ENTITY_NAMES,
  masterResponseSchema,
  transactionsResponseSchema,
  transactionStatusResponseSchema,
  workplanResponseSchema,
} from '../../src/sync/contract';
import { API_PREFIX, createApp } from './app';
import { jakartaDate, TEST_PASSWORD } from './seed';
import { Store } from './store';

let now = Date.parse('2026-10-18T02:00:00Z');
const store = new Store({ now: () => now, postDelayMs: 60_000 });
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';
const today = jakartaDate(new Date(now));

before(async () => {
  server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
beforeEach(() => {
  now = Date.parse('2026-10-18T02:00:00Z');
  store.reset();
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${base}${path.startsWith('/_dev') ? '' : API_PREFIX}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function login(user = 'mandor.panen') {
  const r = await call('POST', '/auth/token', {
    login: user,
    password: TEST_PASSWORD,
    device_id: 'dev-1',
    device_model: 'Test',
    app_version: '0.1.0',
  });
  assert.equal(r.status, 200);
  return authTokenResponseSchema.parse(r.json);
}

const meta = (userId: number, over: Record<string, unknown> = {}) => ({
  user_id: userId,
  device_id: 'dev-1',
  created_trusted_at: new Date(now).toISOString(),
  device_time_at: new Date(now).toISOString(),
  time_source: 'server',
  lat: 0.51,
  lng: 101.41,
  accuracy_m: 5,
  mocked: false,
  rooted: false,
  correction_of: null,
  ...over,
});

const checkIn = (userId: number, employeeId: number, gangId: number, over: Record<string, unknown> = {}) => ({
  type: 'attendance',
  mobile_uuid: randomUUID(),
  meta: meta(userId),
  payload: {
    work_date: today,
    employee_id: employeeId,
    gang_id: gangId,
    type: 'check_in',
    att_status: 'hadir',
    late_reason: null,
    photo_id: null,
    outside_afdeling: false,
    ...over,
  },
});

function ticket(userId: number, employeeId: number, over: Record<string, unknown> = {}) {
  const block = store.getMaster<{ id: number; bjr_kg: number }>('block', 1)!;
  return {
    type: 'harvest_ticket',
    mobile_uuid: randomUUID(),
    meta: meta(userId),
    payload: {
      work_date: today,
      ticket_no: `AFD01-${today.slice(2).replaceAll('-', '')}-AB12-${String(Math.floor(Math.random() * 9000) + 1).padStart(4, '0')}`,
      tph_id: 1,
      block_id: 1,
      harvester_employee_id: employeeId,
      ripe: 10,
      unripe: 0,
      rotten: 0,
      empty_bunch: 0,
      long_stalk: 0,
      loose_fruit_kg: 2,
      est_kg: 10 * block.bjr_kg,
      photo_id: null,
      is_late_entry: false,
      ...over,
    },
  };
}

describe('seed & master', () => {
  it('snapshot penuh sesuai kontrak dan jumlah data dummy', async () => {
    const { access_token } = await login();
    const r = await call('GET', '/master', undefined, access_token);
    const m = masterResponseSchema.parse(r.json);
    assert.equal(m.has_more, false);
    assert.equal(m.changes.estate?.upserts.length, 1);
    assert.equal(m.changes.afdeling?.upserts.length, 3);
    assert.equal(m.changes.block?.upserts.length, 40);
    assert.equal(m.changes.tph?.upserts.length, 120);
    assert.equal(m.changes.employee?.upserts.length, 200);
    assert.ok((m.changes.work_plan?.upserts.length ?? 0) > 0);
  });

  it('delta via cursor hanya berisi perubahan + delete', async () => {
    const { access_token } = await login();
    const first = masterResponseSchema.parse((await call('GET', '/master', undefined, access_token)).json);
    await call('POST', '/_dev/master/block/5', { bjr_kg: 22.2 });
    await call('DELETE', '/_dev/master/vehicle/2');
    const delta = masterResponseSchema.parse((await call('GET', `/master?since=${first.cursor}`, undefined, access_token)).json);
    assert.deepEqual(delta.changes.block?.upserts.map((b) => [b.id, b.bjr_kg]), [[5, 22.2]]);
    assert.deepEqual(delta.changes.vehicle?.deletes, [2]);
    assert.equal(delta.changes.employee, undefined);
    const empty = masterResponseSchema.parse((await call('GET', `/master?since=${delta.cursor}`, undefined, access_token)).json);
    assert.deepEqual(empty.changes, {});
    assert.equal(empty.cursor, delta.cursor);
  });

  it('paginasi dengan has_more', async () => {
    const small = new Store({ masterPageSize: 100 });
    let page = small.masterSince(undefined);
    let total = 0;
    let pages = 0;
    for (;;) {
      pages++;
      total += Object.values(page.changes).reduce((n, c) => n + (c?.upserts.length ?? 0), 0);
      if (!page.has_more) break;
      page = small.masterSince(page.cursor);
    }
    assert.ok(pages > 1);
    assert.equal(total, MASTER_ENTITY_NAMES.reduce((n, e) => n + small.listMaster(e).length, 0));
  });

  it('workplan per tanggal dibatasi afdeling user', async () => {
    const { access_token } = await login('mandor.panen');
    const r = workplanResponseSchema.parse((await call('GET', `/workplan?date=${today}`, undefined, access_token)).json);
    assert.ok(r.items.length > 0);
    assert.ok(r.items.every((w) => w.afdeling_id === 1 && w.date === today));
  });
});

describe('auth', () => {
  it('kredensial salah → 401 dengan format error kontrak', async () => {
    const r = await call('POST', '/auth/token', { login: 'mandor.panen', password: 'x', device_id: 'd', device_model: 'm', app_version: '1' });
    assert.equal(r.status, 401);
    assert.equal(errorResponseSchema.parse(r.json).error.code, 'invalid_credentials');
  });

  it('tanpa token → 401; token kedaluwarsa → refresh (rotasi sekali pakai)', async () => {
    assert.equal((await call('GET', '/master')).status, 401);
    const t = await login();
    now += 3601 * 1000;
    assert.equal((await call('GET', '/master', undefined, t.access_token)).status, 401);
    const r = await call('POST', '/auth/refresh', { refresh_token: t.refresh_token });
    assert.equal(r.status, 200);
    const t2 = authTokenResponseSchema.parse(r.json);
    assert.equal((await call('GET', '/master', undefined, t2.access_token)).status, 200);
    assert.equal((await call('POST', '/auth/refresh', { refresh_token: t.refresh_token })).status, 401);
  });

  it('server_time di setiap respons', async () => {
    const r = await call('GET', '/master');
    assert.ok(typeof r.json.server_time === 'string');
  });
});

describe('transaksi', () => {
  it('absen lalu tiket panen dalam satu batch diterima; kirim ulang = duplicate', async () => {
    const { access_token, user } = await login();
    const items = [checkIn(user.id, 2, 2), ticket(user.id, 2)];
    const r1 = transactionsResponseSchema.parse((await call('POST', '/transactions', { items }, access_token)).json);
    assert.deepEqual(r1.results.map((r) => r.status), ['accepted', 'accepted']);
    const r2 = transactionsResponseSchema.parse((await call('POST', '/transactions', { items }, access_token)).json);
    assert.deepEqual(r2.results.map((r) => r.status), ['duplicate', 'duplicate']);
    assert.equal(r2.results[1]!.server_id, r1.results[1]!.server_id);
  });

  it('menolak tiket pekerja tanpa check-in', async () => {
    const { access_token, user } = await login();
    const r = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [ticket(user.id, 3)] }, access_token)).json);
    assert.equal(r.results[0]!.status, 'rejected');
    assert.equal(r.results[0]!.reason, 'no_check_in');
  });

  it('menolak est_kg tidak sesuai BJR dan tiket kedua tanpa tanda susulan', async () => {
    const { access_token, user } = await login();
    await call('POST', '/transactions', { items: [checkIn(user.id, 2, 2)] }, access_token);
    const bad = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [ticket(user.id, 2, { est_kg: 1 })] }, access_token)).json);
    assert.equal(bad.results[0]!.reason, 'est_kg_mismatch');
    await call('POST', '/transactions', { items: [ticket(user.id, 2)] }, access_token);
    const second = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [ticket(user.id, 2), ticket(user.id, 2, { is_late_entry: true })] }, access_token)).json);
    assert.deepEqual(second.results.map((r) => r.reason ?? r.status), ['second_ticket_must_be_late_entry', 'accepted']);
  });

  it('satu pekerja hanya check-in di satu gang per hari', async () => {
    const { access_token, user } = await login();
    const r = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [checkIn(user.id, 2, 2), checkIn(user.id, 2, 3)] }, access_token)).json,
    );
    assert.deepEqual(r.results.map((x) => x.reason ?? x.status), ['accepted', 'already_checked_in_other_gang']);
  });

  it('sakit tidak dihitung hadir; koreksi menjadi hadir membuka penugasan', async () => {
    const { access_token, user } = await login();
    const sick = checkIn(user.id, 7, 7, { att_status: 'sakit' });
    const assign = (n: string) => ({
      type: 'assignment',
      mobile_uuid: randomUUID(),
      meta: meta(user.id),
      payload: { work_date: today, work_plan_id: null, unplanned_reason: n, activity_id: 2, block_id: 1, employee_ids: [7] },
    });
    const r1 = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [sick, assign('a')] }, access_token)).json);
    assert.deepEqual(r1.results.map((r) => r.reason ?? r.status), ['accepted', 'no_check_in:7']);
    const fix = { ...checkIn(user.id, 7, 7), meta: meta(user.id, { correction_of: sick.mobile_uuid }) };
    const r2 = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [fix, assign('b')] }, access_token)).json);
    assert.deepEqual(r2.results.map((r) => r.status), ['accepted', 'accepted']);
  });

  it('check-out tanpa check-in hadir ditolak; check-in ganda di gang sama ditolak', async () => {
    const { access_token, user } = await login();
    const out = { ...checkIn(user.id, 8, 8), payload: { ...checkIn(user.id, 8, 8).payload, type: 'check_out' } };
    const r = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [out, checkIn(user.id, 8, 8), checkIn(user.id, 8, 8)] }, access_token)).json,
    );
    assert.deepEqual(r.results.map((x) => x.reason ?? x.status), ['not_checked_in', 'accepted', 'already_checked_in']);
  });

  it('payload tidak valid ditolak per item, tidak menggagalkan batch', async () => {
    const { access_token, user } = await login();
    const broken = { ...checkIn(user.id, 2, 2), payload: { work_date: 'kemarin' } };
    const r = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [broken, checkIn(user.id, 4, 4)] }, access_token)).json);
    assert.equal(r.results[0]!.status, 'rejected');
    assert.match(r.results[0]!.reason ?? '', /invalid_payload/);
    assert.equal(r.results[1]!.status, 'accepted');
  });

  it('batch > 500 → 413', async () => {
    const { access_token, user } = await login();
    const items = Array.from({ length: 501 }, () => checkIn(user.id, 2, 2));
    const r = await call('POST', '/transactions', { items }, access_token);
    assert.equal(r.status, 413);
  });

  it('status accepted → posted setelah jeda posting', async () => {
    const { access_token, user } = await login();
    const att = checkIn(user.id, 2, 2);
    await call('POST', '/transactions', { items: [att] }, access_token);
    const unknown = randomUUID();
    let s = transactionStatusResponseSchema.parse((await call('GET', `/transactions/status?ids=${att.mobile_uuid},${unknown}`, undefined, access_token)).json);
    assert.deepEqual(s.results.map((r) => r.status), ['accepted', 'unknown']);
    now += 61_000;
    s = transactionStatusResponseSchema.parse((await call('GET', `/transactions/status?ids=${att.mobile_uuid}`, undefined, access_token)).json);
    assert.equal(s.results[0]!.status, 'posted');
    assert.ok(s.results[0]!.posted_at);
  });
});

describe('foto', () => {
  async function upload(token: string, data: Buffer, sha: string, photoUuid = randomUUID()) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: 'image/jpeg' }), 'p.jpg');
    form.append('mobile_uuid_photo', photoUuid);
    form.append('sha256', sha);
    form.append('transaction_uuid', randomUUID());
    const res = await fetch(`${base}${API_PREFIX}/photos`, { method: 'POST', body: form, headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, json: (await res.json()) as any };
  }

  it('memverifikasi sha256 dan idempoten per mobile_uuid_photo', async () => {
    const { access_token } = await login();
    const data = Buffer.from('jpeg-bytes');
    const sha = createHash('sha256').update(data).digest('hex');
    const id = randomUUID();
    const a = await upload(access_token, data, sha, id);
    const b = await upload(access_token, data, sha, id);
    assert.equal(a.status, 200);
    assert.equal(a.json.photo_id, b.json.photo_id);
    const bad = await upload(access_token, data, 'f'.repeat(64));
    assert.equal(bad.status, 422);
  });
});

describe('approval & heartbeat', () => {
  it('transaksi berflag muncul untuk asisten afdeling terkait sampai diputuskan', async () => {
    const mandor = await login('mandor.panen');
    const att = checkIn(mandor.user.id, 2, 2, { outside_afdeling: true });
    await call('POST', '/transactions', { items: [att] }, mandor.access_token);

    const asisten = await login('asisten');
    const list = approvalsResponseSchema.parse((await call('GET', '/approvals?afdeling_id=1', undefined, asisten.access_token)).json);
    assert.equal(list.items.length, 1);
    assert.deepEqual(list.items[0]!.flags, ['outside_afdeling']);

    const other = await login('asisten2');
    const none = approvalsResponseSchema.parse((await call('GET', '/approvals', undefined, other.access_token)).json);
    assert.equal(none.items.length, 0);

    const decision = { mobile_uuid: randomUUID(), target_uuid: att.mobile_uuid, target_type: 'attendance', decision: 'approve', note: null, corrected_json: null };
    const d1 = await call('POST', '/approvals', { items: [decision] }, asisten.access_token);
    assert.equal(d1.json.results[0].status, 'accepted');
    const d2 = await call('POST', '/approvals', { items: [decision] }, asisten.access_token);
    assert.equal(d2.json.results[0].status, 'duplicate');
    const after = approvalsResponseSchema.parse((await call('GET', '/approvals', undefined, asisten.access_token)).json);
    assert.equal(after.items.length, 0);

    assert.equal((await call('GET', '/approvals', undefined, mandor.access_token)).status, 403);
  });

  it('transaksi dengan waktu perangkat (anchor hilang) diberi flag untrusted_time', async () => {
    const mandor = await login('mandor.panen');
    const att = { ...checkIn(mandor.user.id, 5, 5), meta: meta(mandor.user.id, { time_source: 'device' }) };
    await call('POST', '/transactions', { items: [att] }, mandor.access_token);
    assert.deepEqual(store.transactions.get(att.mobile_uuid)?.flags, ['untrusted_time']);
  });

  it('heartbeat tersimpan per device', async () => {
    const { access_token } = await login();
    const r = await call('POST', '/device/heartbeat', { app_version: '0.1.0', battery: 0.8, pending_count: 3, last_sync_at: null }, access_token);
    assert.equal(r.status, 200);
    assert.equal(store.heartbeats.get('dev-1')?.pending_count, 3);
  });
});
