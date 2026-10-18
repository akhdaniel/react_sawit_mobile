import { z } from 'zod';

import { MemoryKV } from '@/lib/secure-kv';
import { ApiClient, AuthRequiredError, TOKEN_KEYS, TokenStore } from '@/sync/api-client';
import { HttpClient } from '@/sync/http';
import { fakeFetch, ST, type FakeReply, type RecordedCall } from '@/test/fake-fetch';

const NOW = Date.parse(ST);
const okSchema = z.object({ ok: z.literal(true) });
const tokenBody = (n: number) => ({
  access_token: `acc${n}`,
  refresh_token: `ref${n}`,
  expires_in: 3600,
  user: { id: 1, name: 'A', roles: ['mandor_panen'], afdeling_ids: [1] },
  server_time: ST,
});

async function setup(handler: (c: RecordedCall) => FakeReply, tokens: { access?: string; refresh?: string; expiresAt?: number }) {
  const kv = new MemoryKV();
  if (tokens.access) await kv.set(TOKEN_KEYS.access, tokens.access);
  if (tokens.refresh) await kv.set(TOKEN_KEYS.refresh, tokens.refresh);
  if (tokens.expiresAt) await kv.set(TOKEN_KEYS.expiresAt, String(tokens.expiresAt));
  const f = fakeFetch(handler);
  const http = new HttpClient({ baseUrl: () => 'http://s', fetchFn: f.fn, retries: 0 });
  return { api: new ApiClient(http, new TokenStore(kv), () => NOW), calls: f.calls, kv };
}

describe('ApiClient', () => {
  it('mengirim Bearer token yang masih berlaku', async () => {
    const { api, calls } = await setup(() => ({ status: 200, body: { ok: true } }), { access: 'acc0', refresh: 'ref0', expiresAt: NOW + 600_000 });
    await api.request('GET', '/master', { schema: okSchema });
    expect(calls[0]!.headers.authorization).toBe('Bearer acc0');
  });

  it('refresh lebih dulu bila token hampir kedaluwarsa', async () => {
    const { api, calls, kv } = await setup(
      (c) => (c.url.endsWith('/auth/refresh') ? { status: 200, body: tokenBody(1) } : { status: 200, body: { ok: true } }),
      { access: 'acc0', refresh: 'ref0', expiresAt: NOW + 10_000 },
    );
    await api.request('GET', '/master', { schema: okSchema });
    expect(calls.map((c) => c.url)).toEqual(['http://s/auth/refresh', 'http://s/master']);
    expect(calls[1]!.headers.authorization).toBe('Bearer acc1');
    expect(await kv.get(TOKEN_KEYS.refresh)).toBe('ref1');
  });

  it('401 → refresh lalu ulang sekali', async () => {
    let first = true;
    const { api, calls } = await setup((c) => {
      if (c.url.endsWith('/auth/refresh')) return { status: 200, body: tokenBody(2) };
      if (first) {
        first = false;
        return { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } };
      }
      return { status: 200, body: { ok: true } };
    }, { access: 'acc0', refresh: 'ref0', expiresAt: NOW + 600_000 });
    await expect(api.request('GET', '/master', { schema: okSchema })).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls[2]!.headers.authorization).toBe('Bearer acc2');
  });

  it('refresh ditolak → token dihapus dan AuthRequiredError', async () => {
    const { api, kv } = await setup(
      () => ({ status: 401, body: { error: { code: 'invalid_refresh_token', message: 'x' } } }),
      { access: 'acc0', refresh: 'ref0', expiresAt: NOW - 1 },
    );
    await expect(api.request('GET', '/master', { schema: okSchema })).rejects.toBeInstanceOf(AuthRequiredError);
    expect(await kv.get(TOKEN_KEYS.refresh)).toBeNull();
  });

  it('tanpa token sama sekali → AuthRequiredError tanpa request', async () => {
    const { api, calls } = await setup(() => ({ status: 200, body: { ok: true } }), {});
    await expect(api.request('GET', '/master', { schema: okSchema })).rejects.toBeInstanceOf(AuthRequiredError);
    expect(calls).toHaveLength(0);
  });

  it('refresh single-flight untuk permintaan paralel', async () => {
    const { api, calls } = await setup(
      (c) => (c.url.endsWith('/auth/refresh') ? { status: 200, body: tokenBody(3) } : { status: 200, body: { ok: true } }),
      { access: 'acc0', refresh: 'ref0', expiresAt: NOW - 1 },
    );
    await Promise.all([1, 2, 3].map(() => api.request('GET', '/master', { schema: okSchema })));
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});
