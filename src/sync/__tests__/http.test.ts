import { z } from 'zod';

import { ApiError, backoffDelay, HttpClient, NetworkError } from '@/sync/http';
import { fakeFetch, ST } from '@/test/fake-fetch';

const schema = z.object({ ok: z.boolean(), server_time: z.string() });

function client(replies: Parameters<typeof fakeFetch>[0], extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  const f = fakeFetch(replies);
  const sleeps: number[] = [];
  const onServerTime = jest.fn();
  const http = new HttpClient({
    baseUrl: () => 'http://srv/xsm/v1',
    fetchFn: f.fn,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 1,
    onServerTime,
    ...extra,
  });
  return { http, calls: f.calls, sleeps, onServerTime };
}

describe('HttpClient', () => {
  it('sukses: validasi zod + kalibrasi server_time', async () => {
    const { http, calls, onServerTime } = client([{ status: 200, body: { ok: true, server_time: ST } }]);
    await expect(http.request('POST', '/x', { body: { a: 1 }, schema })).resolves.toEqual({ ok: true, server_time: ST });
    expect(calls[0]).toMatchObject({ url: 'http://srv/xsm/v1/x', method: 'POST', body: { a: 1 } });
    expect(calls[0]!.headers['content-type']).toBe('application/json');
    expect(onServerTime).toHaveBeenCalledWith(ST);
  });

  it('retry dengan backoff eksponensial untuk error jaringan dan 5xx', async () => {
    const { http, calls, sleeps } = client([
      { networkError: true },
      { status: 503, body: { error: { code: 'unavailable', message: 'x' }, server_time: ST } },
      { status: 200, body: { ok: true, server_time: ST } },
    ]);
    await expect(http.request('GET', '/x', { schema })).resolves.toMatchObject({ ok: true });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('menyerah setelah batas retry dengan error terakhir', async () => {
    const { http, calls } = client([{ networkError: true }, { networkError: true }, { networkError: true }, { networkError: true }]);
    await expect(http.request('GET', '/x', { schema })).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(4);
  });

  it('tidak retry untuk 4xx; error kontrak diparse', async () => {
    const { http, calls, onServerTime } = client([
      { status: 400, body: { error: { code: 'validation_error', message: 'items wajib' }, server_time: ST } },
    ]);
    const err = await http.request('POST', '/x', { schema }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'validation_error', message: 'items wajib' });
    expect(calls).toHaveLength(1);
    expect(onServerTime).toHaveBeenCalledWith(ST);
  });

  it('retry: false menonaktifkan percobaan ulang', async () => {
    const { http, calls } = client([{ networkError: true }]);
    await expect(http.request('GET', '/x', { schema, retry: false })).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(1);
  });

  it('timeout membatalkan request', async () => {
    const { http } = client([{ hang: true }], { retries: 0, timeoutMs: 20 });
    const err = await http.request('GET', '/x', { schema }).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.timedOut).toBe(true);
  });

  it('respons tidak sesuai kontrak → ApiError invalid_response', async () => {
    const { http } = client([{ status: 200, body: { nope: 1 } }]);
    await expect(http.request('GET', '/x', { schema })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('backoff dibatasi maxMs dan diberi jitter', () => {
    const opts = { baseMs: 500, maxMs: 8000 };
    expect(backoffDelay(0, opts, () => 1)).toBe(500);
    expect(backoffDelay(10, opts, () => 1)).toBe(8000);
    expect(backoffDelay(2, opts, () => 0)).toBe(1000);
  });
});
