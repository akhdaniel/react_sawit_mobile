/** fetch palsu berbasis antrean respons; mencatat setiap request. */
export type FakeReply =
  | { status: number; body?: unknown }
  | { networkError: true }
  | { hang: true };

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export function fakeFetch(replies: FakeReply[] | ((call: RecordedCall) => FakeReply)) {
  const calls: RecordedCall[] = [];
  const queue = Array.isArray(replies) ? [...replies] : null;
  const fn = (async (url: string, init: RequestInit = {}) => {
    const call: RecordedCall = {
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    };
    calls.push(call);
    const reply = queue ? queue.shift() : (replies as (c: RecordedCall) => FakeReply)(call);
    if (!reply) throw new Error(`Tidak ada respons palsu untuk ${call.method} ${url}`);
    if ('networkError' in reply) throw new TypeError('Network request failed');
    if ('hang' in reply) {
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      });
    }
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => {
        if (reply.body === undefined) throw new SyntaxError('no body');
        return reply.body;
      },
    } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

export const ST = '2026-10-18T03:00:00.000Z';
