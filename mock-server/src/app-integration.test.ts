/**
 * Integrasi: kode klien aplikasi (HttpClient, ApiClient, SessionService, TrustedClock)
 * dijalankan terhadap mock server sungguhan.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { SessionService } from '../../src/features/auth/session-service';
import { MemoryKV } from '../../src/lib/secure-kv';
import { TrustedClock, type ClockSource, type TimeAnchor } from '../../src/lib/trusted-time';
import { ApiClient, AuthRequiredError, TokenStore } from '../../src/sync/api-client';
import { masterResponseSchema } from '../../src/sync/contract';
import { HttpClient } from '../../src/sync/http';
import { API_PREFIX, createApp } from './app';
import { TEST_PASSWORD } from './seed';
import { Store } from './store';

const SERVER_NOW = Date.parse('2026-10-18T02:00:00Z');
const store = new Store({ now: () => SERVER_NOW });
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let baseUrl = '';

before(async () => {
  server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${API_PREFIX}`;
});
after(() => server.close());

function makeClient() {
  // Jam HP sengaja salah 2 hari; trusted time harus mengikuti server.
  const device: ClockSource = { elapsedMs: () => 5_000, bootCount: () => 3, wallMs: () => SERVER_NOW - 2 * 86_400_000 };
  let anchor: TimeAnchor | null = null;
  const clock = new TrustedClock(device, { load: () => anchor, save: (a) => (anchor = a) }, 420);
  const kv = new MemoryKV();
  const http = new HttpClient({ baseUrl: () => baseUrl, retries: 0, onServerTime: (iso) => clock.calibrate(iso) });
  const api = new ApiClient(http, new TokenStore(kv), () => clock.now().ms);
  let lastUserId: number | null = null;
  const session = new SessionService({
    kv,
    api,
    sha256: async (t) => createHash('sha256').update(t).digest('hex'),
    randomHex: (n) => randomBytes(n).toString('hex'),
    now: () => clock.now().ms,
    device: () => ({ deviceId: 'and-int-test', deviceModel: 'node', appVersion: '0.2.0' }),
    pendingCount: () => 0,
    lastUserId: () => lastUserId,
    setLastUserId: (id) => {
      lastUserId = id;
    },
  });
  return { clock, api, session };
}

describe('integrasi klien app ↔ mock server', () => {
  it('login → kalibrasi waktu → GET /master ber-token → refresh setelah token dicabut', async () => {
    const { clock, api, session } = makeClient();
    assert.equal(clock.now().source, 'device');

    const s = await session.login('mandor.panen', TEST_PASSWORD);
    assert.deepEqual(s.user.roles, ['mandor_panen']);
    assert.equal(clock.now().source, 'server');
    assert.equal(clock.now().iso, '2026-10-18T02:00:00.000Z');
    assert.equal(clock.workDate(), '2026-10-18');

    const master = await api.request('GET', '/master', { schema: masterResponseSchema });
    assert.equal(master.changes.block?.upserts.length, 40);

    store.expireAllAccessTokens();
    const again = await api.request('GET', `/master?since=${master.cursor}`, { schema: masterResponseSchema });
    assert.equal(again.cursor, master.cursor);

    await session.setPin('2468');
    assert.deepEqual(await session.verifyPin('2468'), { ok: true });
  });

  it('password salah ditolak dengan SessionError', async () => {
    const { session } = makeClient();
    await assert.rejects(session.login('mandor.panen', 'salah'), { code: 'invalid_credentials' });
  });

  it('server mati → offline', async () => {
    const { session } = makeClient();
    const saved = baseUrl;
    baseUrl = 'http://127.0.0.1:1/xsm/v1';
    try {
      await assert.rejects(session.login('mandor.panen', TEST_PASSWORD), { code: 'offline' });
    } finally {
      baseUrl = saved;
    }
  });

  it('tanpa login, request ber-token gagal dengan AuthRequiredError', async () => {
    const { api } = makeClient();
    await assert.rejects(api.request('GET', '/master', { schema: masterResponseSchema }), AuthRequiredError);
  });
});
