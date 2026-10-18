/**
 * Fetch wrapper: timeout (AbortController), retry dengan exponential backoff + jitter
 * untuk error jaringan/timeout/5xx/429, parsing error kontrak {error:{code,message}},
 * validasi respons dengan zod, dan kalibrasi trusted-time dari server_time.
 *
 * Hanya dipakai oleh sync engine & alur login — layar tidak memanggil API langsung.
 */
import type { z } from 'zod';

import { errorResponseSchema } from './contract';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Tidak ada koneksi / server tidak terjangkau / timeout. */
export class NetworkError extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
}

export interface HttpClientOptions {
  baseUrl: () => string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Jumlah percobaan ulang setelah percobaan pertama. */
  retries?: number;
  backoff?: BackoffOptions;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Dipanggil untuk setiap server_time yang diterima (sukses maupun error). */
  onServerTime?: (iso: string) => void;
}

export interface RequestOptions<T> {
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  schema: z.ZodType<T>;
  /** false untuk menonaktifkan retry (default true). */
  retry?: boolean;
  timeoutMs?: number;
}

const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 8_000 };

/** Delay backoff ke-n (0-based): min(max, base·2ⁿ) dengan jitter 50–100%. */
export function backoffDelay(attempt: number, opts: BackoffOptions, random: () => number): number {
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** attempt);
  return Math.round(exp * (0.5 + random() * 0.5));
}

export function isRetriable(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof ApiError) return err.status >= 500 || err.status === 429;
  return false;
}

export class HttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoff: BackoffOptions;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly opts: HttpClientOptions) {
    this.fetchFn = opts.fetchFn ?? ((...args) => fetch(...args));
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.retries = opts.retries ?? 3;
    this.backoff = opts.backoff ?? DEFAULT_BACKOFF;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  async request<T>(method: string, path: string, options: RequestOptions<T>): Promise<T> {
    const maxAttempts = options.retry === false ? 1 : this.retries + 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.once(method, path, options);
      } catch (err) {
        lastError = err;
        if (!isRetriable(err) || attempt === maxAttempts - 1) break;
        await this.sleep(backoffDelay(attempt, this.backoff, this.random));
      }
    }
    throw lastError;
  }

  private async once<T>(method: string, path: string, options: RequestOptions<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = options.timeoutMs ?? this.timeoutMs;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    let res: Response;
    try {
      const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
      let body: BodyInit | undefined;
      if (options.formData) body = options.formData;
      else if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
      res = await this.fetchFn(`${this.opts.baseUrl()}${path}`, { method, headers, body, signal: controller.signal });
    } catch (e) {
      throw timedOut
        ? new NetworkError(`Tidak ada respons dalam ${Math.round(timeout / 1000)} detik`, true)
        : new NetworkError(e instanceof Error ? e.message : 'Gagal terhubung ke server');
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }

    const serverTime = (json as { server_time?: unknown } | undefined)?.server_time;
    if (typeof serverTime === 'string') this.opts.onServerTime?.(serverTime);

    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(json);
      throw parsed.success
        ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message)
        : new ApiError(res.status, `http_${res.status}`, `Server membalas status ${res.status}`);
    }

    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(res.status, 'invalid_response', `Respons server tidak sesuai kontrak: ${parsed.error.issues[0]?.message ?? ''}`);
    }
    return parsed.data;
  }
}
