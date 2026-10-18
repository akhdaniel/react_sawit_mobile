import { createHash, randomBytes } from 'node:crypto';

import {
  lockDurationMs,
  MAX_PIN_FAILURES,
  PIN_LOCK_AFTER,
  SESSION_KEYS,
  SessionError,
  SessionService,
} from '@/features/auth/session-service';
import { MemoryKV } from '@/lib/secure-kv';
import { ApiClient, TOKEN_KEYS, TokenStore } from '@/sync/api-client';
import { HttpClient } from '@/sync/http';
import { fakeFetch, ST, type FakeReply } from '@/test/fake-fetch';

const user = (id: number) => ({ id, name: `User ${id}`, roles: ['mandor_panen'], afdeling_ids: [1] });
const tokenReply = (id: number): FakeReply => ({
  status: 200,
  body: { access_token: 'a', refresh_token: 'r', expires_in: 3600, user: user(id), server_time: ST },
});

function setup(reply: FakeReply | FakeReply[] = tokenReply(1), opts: { pending?: number; lastUserId?: number | null } = {}) {
  const kv = new MemoryKV();
  const f = fakeFetch(Array.isArray(reply) ? reply : [reply]);
  const api = new ApiClient(new HttpClient({ baseUrl: () => 'http://s', fetchFn: f.fn, retries: 0 }), new TokenStore(kv));
  const state = { now: 1_000_000, pending: opts.pending ?? 0, lastUserId: opts.lastUserId ?? null };
  const svc = new SessionService({
    kv,
    api,
    sha256: async (t) => createHash('sha256').update(t).digest('hex'),
    randomHex: (n) => randomBytes(n).toString('hex'),
    now: () => state.now,
    device: () => ({ deviceId: 'dev-1', deviceModel: 'Test', appVersion: '0.2.0' }),
    pendingCount: () => state.pending,
    lastUserId: () => state.lastUserId,
    setLastUserId: (id) => {
      state.lastUserId = id;
    },
  });
  return { svc, kv, calls: f.calls, state };
}

describe('SessionService.login', () => {
  it('login online menyimpan token, profil, user terakhir; minta PIN', async () => {
    const { svc, kv, calls, state } = setup();
    const s = await svc.login(' mandor.panen ', 'pw');
    expect(s).toEqual({ user: user(1), hasPin: false });
    expect(calls[0]!.body).toMatchObject({ login: 'mandor.panen', device_id: 'dev-1', app_version: '0.2.0' });
    expect(await kv.get(TOKEN_KEYS.access)).toBe('a');
    expect(state.lastUserId).toBe(1);
    expect(await svc.restore()).toEqual({ user: user(1), hasPin: false });
  });

  it('offline → SessionError offline', async () => {
    const { svc } = setup({ networkError: true });
    await expect(svc.login('x', 'y')).rejects.toMatchObject({ code: 'offline' });
  });

  it('kredensial salah → invalid_credentials', async () => {
    const { svc } = setup({ status: 401, body: { error: { code: 'invalid_credentials', message: 'x' } } });
    await expect(svc.login('x', 'y')).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('ganti pengguna ditolak bila masih ada data belum terkirim; token tidak disimpan', async () => {
    const { svc, kv } = setup(tokenReply(2), { pending: 3, lastUserId: 1 });
    await expect(svc.login('lain', 'pw')).rejects.toMatchObject({ code: 'pending_other_user' });
    expect(await kv.get(TOKEN_KEYS.access)).toBeNull();
  });

  it('ganti pengguna tanpa pending → PIN lama dihapus', async () => {
    const { svc, kv } = setup(tokenReply(2), { pending: 0, lastUserId: 1 });
    await kv.set(SESSION_KEYS.pin, '{"salt":"x","hash":"y"}');
    const s = await svc.login('lain', 'pw');
    expect(s.hasPin).toBe(false);
  });

  it('pengguna sama login ulang → PIN dipertahankan', async () => {
    const { svc } = setup([tokenReply(1), tokenReply(1)]);
    await svc.login('a', 'b');
    await svc.setPin('1234');
    expect((await svc.login('a', 'b')).hasPin).toBe(true);
  });
});

describe('login ulang', () => {
  it('memakai nama login tersimpan; akun berbeda ditolak sebelum sesi disimpan', async () => {
    const { svc, kv } = setup([tokenReply(1), tokenReply(1), tokenReply(2)], { pending: 0 });
    await svc.login('mandor', 'pw');
    expect(await svc.reauthenticate('pw')).toMatchObject({ user: { id: 1 } });
    await kv.set(TOKEN_KEYS.access, 'lama');
    await expect(svc.reauthenticate('pw', 'orang.lain')).rejects.toMatchObject({ code: 'pending_other_user' });
    expect(await kv.get(TOKEN_KEYS.access)).toBe('lama');
    expect((await svc.restore())?.user.id).toBe(1);
  });

  it('sesi versi lama tanpa nama login tersimpan: nama login diminta', async () => {
    const { svc, kv } = setup([tokenReply(1), tokenReply(1)]);
    await svc.login('mandor', 'pw');
    await kv.remove(SESSION_KEYS.login);
    await expect(svc.reauthenticate('pw')).rejects.toMatchObject({ message: 'Nama pengguna wajib diisi.' });
    expect(await svc.reauthenticate('pw', ' mandor ')).toMatchObject({ user: { id: 1 } });
    expect(await svc.loginName()).toBe('mandor');
  });
});

describe('PIN', () => {
  it('format 4–6 angka', async () => {
    const { svc } = setup();
    await expect(svc.setPin('12a4')).rejects.toBeInstanceOf(SessionError);
    await expect(svc.setPin('123')).rejects.toMatchObject({ code: 'invalid_pin_format' });
    await expect(svc.setPin('1234567')).rejects.toMatchObject({ code: 'invalid_pin_format' });
  });

  it('disimpan sebagai hash bersalt, bukan teks asli', async () => {
    const { svc, kv } = setup();
    await svc.setPin('482913');
    const raw = (await kv.get(SESSION_KEYS.pin))!;
    expect(raw).not.toContain('482913');
    expect(JSON.parse(raw)).toEqual({ salt: expect.any(String), hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(await svc.verifyPin('482913')).toEqual({ ok: true });
  });

  it('salah berulang → dikunci bertahap, lalu sesi dihapus', async () => {
    const { svc, kv, state } = setup();
    await svc.login('a', 'b');
    await svc.setPin('1111');
    for (let i = 1; i < PIN_LOCK_AFTER; i++) {
      expect(await svc.verifyPin('0000')).toMatchObject({ ok: false, reason: 'wrong', lockedUntil: null });
    }
    const r5 = await svc.verifyPin('0000');
    expect(r5).toMatchObject({ reason: 'wrong', lockedUntil: state.now + 30_000 });
    // selama terkunci, PIN benar pun ditolak
    expect(await svc.verifyPin('1111')).toMatchObject({ reason: 'locked' });
    for (let i = PIN_LOCK_AFTER + 1; i < MAX_PIN_FAILURES; i++) {
      state.now += 10 * 60_000;
      await svc.verifyPin('0000');
    }
    state.now += 60 * 60_000;
    expect(await svc.verifyPin('0000')).toEqual({ ok: false, reason: 'wiped' });
    expect(await svc.restore()).toBeNull();
    expect(await kv.get(TOKEN_KEYS.access)).toBeNull();
  });

  it('PIN benar mereset hitungan gagal', async () => {
    const { svc } = setup();
    await svc.setPin('1111');
    await svc.verifyPin('0000');
    await svc.verifyPin('1111');
    expect(await svc.verifyPin('0000')).toMatchObject({ remainingBeforeWipe: MAX_PIN_FAILURES - 1 });
  });

  it('durasi kunci 30 dtk lalu berlipat', () => {
    expect(lockDurationMs(PIN_LOCK_AFTER - 1)).toBe(0);
    expect(lockDurationMs(PIN_LOCK_AFTER)).toBe(30_000);
    expect(lockDurationMs(PIN_LOCK_AFTER + 2)).toBe(120_000);
  });

  it('lupa PIN menghapus sesi sehingga wajib login ulang', async () => {
    const { svc } = setup();
    await svc.login('a', 'b');
    await svc.setPin('1111');
    await svc.resetForRelogin();
    expect(await svc.restore()).toBeNull();
  });
});

describe('logout', () => {
  it('ditolak bila masih ada data belum terkirim', async () => {
    const { svc } = setup(tokenReply(1), { pending: 2 });
    await svc.login('a', 'b');
    await expect(svc.logout()).rejects.toMatchObject({ code: 'pending_data' });
    expect(await svc.restore()).not.toBeNull();
  });

  it('menghapus token, profil, PIN', async () => {
    const { svc, kv } = setup();
    await svc.login('a', 'b');
    await svc.setPin('1234');
    await svc.logout();
    expect(await svc.restore()).toBeNull();
    expect(kv.data.size).toBe(0);
  });
});
