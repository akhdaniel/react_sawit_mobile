import { checkServer } from '@/sync/server-check';
import { fakeFetch, ST } from '@/test/fake-fetch';

describe('checkServer', () => {
  it('server XSM menolak token kosong dengan server_time → terjangkau', async () => {
    const f = fakeFetch([{ status: 400, body: { error: { code: 'validation_error', message: 'x' }, server_time: ST } }]);
    let t = 1000;
    const r = await checkServer('http://192.168.1.8:8080/xsm/v1/', { fetchFn: f.fn, now: () => (t += 40) });
    expect(r).toEqual({ ok: true, serverTime: ST, latencyMs: 40 });
    expect(f.calls[0]).toMatchObject({ url: 'http://192.168.1.8:8080/xsm/v1/auth/refresh', method: 'POST', body: { refresh_token: '' } });
  });

  it('server lain (tanpa server_time) → not_xsm', async () => {
    const f = fakeFetch([{ status: 404, body: { message: 'Not Found' } }]);
    expect(await checkServer('http://x', { fetchFn: f.fn })).toEqual({ ok: false, reason: 'not_xsm', detail: 'HTTP 404' });
  });

  it('host tidak terjangkau / timeout', async () => {
    expect(await checkServer('http://x', { fetchFn: fakeFetch([{ networkError: true }]).fn })).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(await checkServer('http://x', { fetchFn: fakeFetch([{ hang: true }]).fn, timeoutMs: 20 })).toMatchObject({ ok: false, reason: 'timeout' });
  });
});
