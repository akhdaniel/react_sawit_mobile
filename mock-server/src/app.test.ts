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
  verificationsResponseSchema,
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
    // 200 pekerja kemandoran + 6 sopir.
    assert.equal(m.changes.employee?.upserts.length, 206);
    assert.ok((m.changes.work_plan?.upserts.length ?? 0) > 0);
    // Master struktur ERP: sub blok (blok ke-5 punya dua), tarif panen, PKS, sopir, kepemilikan truk.
    assert.equal(m.changes.sub_blok?.upserts.length, 48);
    assert.equal(m.changes.harvest_rate?.upserts.length, 2);
    assert.equal(m.changes.pks?.upserts.length, 2);
    assert.equal(m.changes.employee?.upserts.filter((e) => e.role === 'sopir').length, 6);
    assert.ok(m.changes.vehicle?.upserts.every((v) => v.ownership === 'own' || v.ownership === 'rental'));
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

  it('server_time dan server_id di setiap respons, termasuk error', async () => {
    const r = await call('GET', '/master');
    assert.ok(typeof r.json.server_time === 'string');
    assert.equal(r.json.server_id, 'mock-server-db');
    const refused = await call('POST', '/auth/refresh', { refresh_token: '' });
    assert.equal(refused.json.server_id, 'mock-server-db');
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

  it('SPB: tiket belum sinkron diterima dengan flag; tiket ganda ditolak kecuali langsir', async () => {
    const { access_token, user } = await login('kerani.transport');
    const spbItem = (tickets: string[], parent: string | null = null, n = 1) => ({
      type: 'spb',
      mobile_uuid: randomUUID(),
      meta: meta(user.id),
      payload: {
        work_date: today,
        spb_no: `AFD01-${today.slice(2).replaceAll('-', '')}-AB12-${String(n).padStart(4, '0')}`,
        vehicle_id: 1,
        driver_name: 'Budi',
        destination: 'internal_mill',
        parent_spb_uuid: parent,
        total_bunch: 10,
        est_kg: 185,
        photo_ids: [randomUUID(), randomUUID()],
        harvest_ticket_uuids: tickets,
      },
    });
    const t1 = randomUUID();
    const first = spbItem([t1], null, 1);
    const r = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [first, spbItem([t1], null, 2), spbItem([t1], first.mobile_uuid, 3)] }, access_token)).json,
    );
    assert.deepEqual(r.results.map((x) => x.reason ?? x.status), ['accepted', 'ticket_already_transported', 'accepted']);
    assert.deepEqual(store.transactions.get(first.mobile_uuid)?.flags, ['unsynced_ticket']);
  });

  it('struktur ERP: sub blok milik blok, susulan per sub blok; SPB dengan PKS, sopir karyawan, dan muatan per tiket', async () => {
    const { access_token, user } = await login('mandor.panen');
    const otherBlockSub = store.getMaster<{ id: number; block_id: number }>('sub_blok', 2)!;
    assert.notEqual(otherBlockSub.block_id, 1);
    const tA = ticket(user.id, 2, { sub_blok_id: 1 });
    const r1 = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [checkIn(user.id, 2, 2), tA, ticket(user.id, 2, { sub_blok_id: otherBlockSub.id })] }, access_token)).json,
    );
    assert.deepEqual(r1.results.map((x) => x.reason ?? x.status), ['accepted', 'accepted', 'sub_blok_block_mismatch']);

    const kt = await login('kerani.transport');
    const spb = (n: number, extra: Record<string, unknown>) => ({
      type: 'spb',
      mobile_uuid: randomUUID(),
      meta: meta(kt.user.id),
      payload: {
        work_date: today,
        spb_no: `AFD01-${today.slice(2).replaceAll('-', '')}-ST01-${String(n).padStart(4, '0')}`,
        vehicle_id: 1,
        driver_name: 'Sopir',
        destination: 'internal_mill',
        parent_spb_uuid: null,
        total_bunch: 6,
        est_kg: 100,
        photo_ids: [randomUUID(), randomUUID()],
        harvest_ticket_uuids: [tA.mobile_uuid],
        ...extra,
      },
    });
    const line = { ticket_uuid: tA.mobile_uuid, bunch_count: 6, loose_fruit_kg: 0 };
    const r2 = transactionsResponseSchema.parse(
      (
        await call(
          'POST',
          '/transactions',
          {
            items: [
              spb(1, { pks_id: 99 }),
              spb(2, { driver_employee_id: 2 }),
              spb(3, { lines: [{ ...line, ticket_uuid: randomUUID() }] }),
              spb(4, { lines: [{ ...line, bunch_count: 0 }] }),
              spb(5, { pks_id: 1, driver_employee_id: 201, lines: [line] }),
            ],
          },
          kt.access_token,
        )
      ).json,
    );
    assert.deepEqual(r2.results.map((x) => x.reason ?? x.status), ['unknown_pks', 'unknown_driver', 'spb_lines_mismatch', 'spb_line_empty', 'accepted']);
  });

  it('material: over-dose wajib ditandai; yang ditandai masuk approval', async () => {
    const { access_token, user } = await login('mandor.rawat');
    const att = checkIn(user.id, 4, 4);
    const up = {
      type: 'upkeep',
      mobile_uuid: randomUUID(),
      meta: meta(user.id),
      payload: { work_date: today, activity_id: 2, block_id: 1, employee_ids: [4], hk: 1, realized_ha: 2, realized_trees: null, photo_id: null },
    };
    // aturan seed: kegiatan 2 + produk 1 = 1.5 L/ha, toleransi 10% → batas 3.3 L untuk 2 ha
    const mat = (qty: number, over: boolean) => ({
      type: 'material_usage',
      mobile_uuid: randomUUID(),
      meta: meta(user.id),
      payload: { upkeep_uuid: up.mobile_uuid, product_id: 1, qty, uom: 'L', over_dose: over, approval_note: over ? 'gulma lebat' : null },
    });
    const r = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [att, up, mat(3.3, false), mat(4, false), mat(4, true)] }, access_token)).json,
    );
    assert.deepEqual(r.results.map((x) => x.reason ?? x.status), ['accepted', 'accepted', 'accepted', 'over_dose_unflagged', 'accepted']);
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

describe('tiket pemupukan', () => {
  // Gang 4 = kemandoran rawat afdeling 1; pekerja #16 anggotanya. Urea: dosis 1,25 kg/pokok.
  const fertilization = (userId: number, over: Record<string, unknown> = {}) => ({
    type: 'fertilization_ticket',
    mobile_uuid: randomUUID(),
    meta: meta(userId),
    payload: {
      work_date: today,
      block_id: 1,
      sub_blok_id: 1,
      gang_id: 4,
      worker_employee_id: 16,
      product_id: 3,
      method: 'manual',
      application_round: 1,
      tree_count: 100,
      qty_kg: 125,
      weather: null,
      notes: null,
      ...over,
    },
  });

  it('diterima sesuai syarat ERP; melebihi dosis atau kemandoran panen ditolak', async () => {
    const { access_token, user } = await login('mandor.rawat');
    const items = [
      checkIn(user.id, 16, 4),
      fertilization(user.id),
      fertilization(user.id, { qty_kg: 125.5 }),
      fertilization(user.id, { gang_id: 1 }),
      fertilization(user.id, { product_id: 1 }),
    ];
    const r = transactionsResponseSchema.parse((await call('POST', '/transactions', { items }, access_token)).json);
    assert.deepEqual(
      r.results.map((x) => x.reason ?? x.status),
      ['accepted', 'accepted', 'over_dose', 'gang_not_rawat', 'unknown_fertilizer'],
    );
  });

  it('tiket mandor rawat muncul di antrean kerani rawat; Lanjutkan pemupukan menghapusnya', async () => {
    const mandor = await login('mandor.rawat');
    const kerani = await login('kerani.rawat');
    assert.deepEqual(kerani.user.roles, ['kerani_rawat']);
    const tk = fertilization(mandor.user.id);
    const go = {
      type: 'stage_confirm',
      mobile_uuid: randomUUID(),
      meta: meta(mandor.user.id),
      payload: { target_type: 'fertilization_ticket', target_uuid: tk.mobile_uuid, core_ticket_id: null },
    };
    const sent = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [checkIn(mandor.user.id, 16, 4), tk, go] }, mandor.access_token)).json,
    );
    assert.deepEqual(sent.results.map((x) => x.status), ['accepted', 'accepted', 'accepted']);

    const queue = verificationsResponseSchema.parse((await call('GET', '/verifications', undefined, kerani.access_token)).json);
    assert.equal(queue.items.length, 0);
    assert.equal(queue.fertilization_items.length, 1);
    assert.equal(queue.fertilization_items[0]!.mobile_uuid, tk.mobile_uuid);
    assert.equal(queue.fertilization_items[0]!.qty_kg, 125);

    const wrongType = {
      type: 'stage_confirm',
      mobile_uuid: randomUUID(),
      meta: meta(kerani.user.id),
      payload: { target_type: 'harvest_ticket', target_uuid: tk.mobile_uuid, core_ticket_id: null },
    };
    const own = { ...wrongType, mobile_uuid: randomUUID(), payload: { ...wrongType.payload, target_type: 'fertilization_ticket', target_uuid: null, core_ticket_id: queue.fertilization_items[0]!.core_ticket_id } };
    const r = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [wrongType, own] }, kerani.access_token)).json);
    assert.deepEqual(r.results.map((x) => x.reason ?? x.status), ['target_type_mismatch', 'accepted']);
    const after = verificationsResponseSchema.parse((await call('GET', '/verifications', undefined, kerani.access_token)).json);
    assert.equal(after.fertilization_items.length, 0);
  });
});

describe('tiket perawatan', () => {
  // Gang 4 = kemandoran rawat afdeling 1; pekerja #16 anggotanya. Glifosat: dosis 2 L/ha.
  const maintenance = (userId: number, over: Record<string, unknown> = {}) => ({
    type: 'maintenance_ticket',
    mobile_uuid: randomUUID(),
    meta: meta(userId),
    payload: {
      work_date: today,
      block_id: 1,
      sub_blok_id: 1,
      gang_id: 4,
      worker_employee_id: 16,
      work_type: 'semprot_gulma',
      area_ha: 1.5,
      tree_count: 0,
      hk: 1,
      weather: null,
      notes: null,
      materials: [{ product_id: 1, qty: 3 }],
      ...over,
    },
  });

  it('diterima sesuai syarat ERP; melebihi dosis, tanpa hasil kerja, atau material tidak sesuai jenis ditolak', async () => {
    const { access_token, user } = await login('mandor.rawat');
    const items = [
      checkIn(user.id, 16, 4),
      maintenance(user.id),
      maintenance(user.id, { materials: [{ product_id: 1, qty: 3.01 }] }),
      maintenance(user.id, { work_type: 'pruning', area_ha: 0, tree_count: 0, materials: [] }),
      maintenance(user.id, { work_type: 'perawatan_parit', area_ha: 0, hk: 0.5, materials: [] }),
      maintenance(user.id, { work_type: 'pengendalian_tikus', materials: [] }),
      maintenance(user.id, { work_type: 'babat_gawangan' }),
    ];
    const r = transactionsResponseSchema.parse((await call('POST', '/transactions', { items }, access_token)).json);
    assert.deepEqual(
      r.results.map((x) => x.reason ?? x.status),
      ['accepted', 'accepted', 'over_dose', 'invalid_work_qty', 'accepted', 'material_required', 'material_not_allowed'],
    );
  });

  it('tiket mandor rawat muncul di antrean perawatan kerani rawat beserta materialnya', async () => {
    const mandor = await login('mandor.rawat');
    const kerani = await login('kerani.rawat');
    const tk = maintenance(mandor.user.id);
    const go = {
      type: 'stage_confirm',
      mobile_uuid: randomUUID(),
      meta: meta(mandor.user.id),
      payload: { target_type: 'maintenance_ticket', target_uuid: tk.mobile_uuid, core_ticket_id: null },
    };
    const sent = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [checkIn(mandor.user.id, 16, 4), tk, go] }, mandor.access_token)).json,
    );
    assert.deepEqual(sent.results.map((x) => x.status), ['accepted', 'accepted', 'accepted']);

    const queue = verificationsResponseSchema.parse((await call('GET', '/verifications', undefined, kerani.access_token)).json);
    assert.equal(queue.maintenance_items.length, 1);
    const item = queue.maintenance_items[0]!;
    assert.equal(item.mobile_uuid, tk.mobile_uuid);
    assert.deepEqual(item.materials.map((m) => m.qty), [3]);

    const own = {
      type: 'stage_confirm',
      mobile_uuid: randomUUID(),
      meta: meta(kerani.user.id),
      payload: { target_type: 'maintenance_ticket', target_uuid: null, core_ticket_id: item.core_ticket_id },
    };
    const r = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [own] }, kerani.access_token)).json);
    assert.equal(r.results[0]!.status, 'accepted');
    const after = verificationsResponseSchema.parse((await call('GET', '/verifications', undefined, kerani.access_token)).json);
    assert.equal(after.maintenance_items.length, 0);
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

  it('keputusan approval lewat POST /transactions: hanya asisten, lalu hilang dari inbox', async () => {
    const mandor = await login('mandor.panen');
    const att = checkIn(mandor.user.id, 3, 3, { outside_afdeling: true });
    await call('POST', '/transactions', { items: [att] }, mandor.access_token);
    const decision = (userId: number) => ({
      type: 'approval_decision',
      mobile_uuid: randomUUID(),
      meta: meta(userId),
      payload: { target_uuid: att.mobile_uuid, target_type: 'attendance', decision: 'approve', note: null, corrected_json: null },
    });
    const byMandor = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [decision(mandor.user.id)] }, mandor.access_token)).json);
    assert.equal(byMandor.results[0]!.reason, 'forbidden');
    const asisten = await login('asisten');
    assert.equal(approvalsResponseSchema.parse((await call('GET', '/approvals?afdeling_id=1', undefined, asisten.access_token)).json).items.length, 1);
    const ok = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [decision(asisten.user.id)] }, asisten.access_token)).json);
    assert.equal(ok.results[0]!.status, 'accepted');
    assert.equal(approvalsResponseSchema.parse((await call('GET', '/approvals?afdeling_id=1', undefined, asisten.access_token)).json).items.length, 0);
  });

  it('heartbeat tersimpan per device', async () => {
    const { access_token } = await login();
    const r = await call('POST', '/device/heartbeat', { app_version: '0.1.0', battery: 0.8, pending_count: 3, last_sync_at: null }, access_token);
    assert.equal(r.status, 200);
    assert.equal(store.heartbeats.get('dev-1')?.pending_count, 3);
  });
});

describe('verifikasi tiket (Lanjutkan)', () => {
  const confirm = (userId: number, target: { target_uuid?: string; core_ticket_id?: number }) => ({
    type: 'stage_confirm',
    mobile_uuid: randomUUID(),
    meta: meta(userId),
    payload: { target_type: 'harvest_ticket', target_uuid: target.target_uuid ?? null, core_ticket_id: target.core_ticket_id ?? null },
  });

  it('tiket kerani muncul di antrean mandor; Lanjutkan mandor menghapusnya', async () => {
    const kerani = await login('kerani.panen');
    const mandor = await login('mandor.panen');
    await call('POST', '/transactions', { items: [checkIn(mandor.user.id, 2, 2)] }, mandor.access_token);
    const tk = ticket(kerani.user.id, 2);
    const own = confirm(kerani.user.id, { target_uuid: tk.mobile_uuid });
    const sent = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [tk, own] }, kerani.access_token)).json);
    assert.deepEqual(sent.results.map((r) => r.status), ['accepted', 'accepted']);

    const queue = verificationsResponseSchema.parse((await call('GET', '/verifications', undefined, mandor.access_token)).json);
    assert.equal(queue.items.length, 1);
    assert.equal(queue.items[0]!.mobile_uuid, tk.mobile_uuid);
    assert.equal(queue.items[0]!.created_by, 'Rina Marlina');
    const mine = verificationsResponseSchema.parse((await call('GET', '/verifications', undefined, kerani.access_token)).json);
    assert.equal(mine.items.length, 0);

    const go = confirm(mandor.user.id, { core_ticket_id: queue.items[0]!.core_ticket_id });
    const r = transactionsResponseSchema.parse((await call('POST', '/transactions', { items: [go] }, mandor.access_token)).json);
    assert.equal(r.results[0]!.status, 'accepted');
    const after = verificationsResponseSchema.parse((await call('GET', '/verifications', undefined, mandor.access_token)).json);
    assert.equal(after.items.length, 0);
  });

  it('target tidak dikenal ditolak; peran lain tidak punya antrean', async () => {
    const mandor = await login('mandor.panen');
    const r = transactionsResponseSchema.parse(
      (await call('POST', '/transactions', { items: [confirm(mandor.user.id, { core_ticket_id: 999999 })] }, mandor.access_token)).json,
    );
    assert.equal(r.results[0]!.reason, 'target_not_found');
    const transport = await login('kerani.transport');
    assert.equal((await call('GET', '/verifications', undefined, transport.access_token)).status, 403);
  });
});
