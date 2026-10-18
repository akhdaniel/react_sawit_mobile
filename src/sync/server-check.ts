/**
 * Uji koneksi ke server XSM tanpa login: kirim POST /auth/refresh dengan token kosong.
 * Server XSM yang sehat menolak (4xx) dengan JSON berisi server_time — itu cukup untuk
 * memastikan alamat benar dan server terjangkau. Tidak mengubah data apa pun.
 */
export type ServerCheckResult =
  | { ok: true; serverTime: string; latencyMs: number }
  | { ok: false; reason: 'unreachable' | 'timeout' | 'not_xsm'; detail: string };

export async function checkServer(
  baseUrl: string,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number; now?: () => number } = {},
): Promise<ServerCheckResult> {
  const fetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const started = now();
  try {
    const res = await fetchFn(`${baseUrl.replace(/\/+$/, '')}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refresh_token: '' }),
      signal: controller.signal,
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    const serverTime = (json as { server_time?: unknown } | undefined)?.server_time;
    if (typeof serverTime === 'string') return { ok: true, serverTime, latencyMs: now() - started };
    return { ok: false, reason: 'not_xsm', detail: `HTTP ${res.status}` };
  } catch (e) {
    if (timedOut) return { ok: false, reason: 'timeout', detail: `${Math.round(timeoutMs / 1000)} detik` };
    return { ok: false, reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
