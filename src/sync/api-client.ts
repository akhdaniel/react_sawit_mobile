/**
 * Klien API /xsm/v1 ber-autentikasi: Bearer token, refresh otomatis sebelum kedaluwarsa
 * dan saat 401 (single-flight), lalu ulang permintaan sekali.
 *
 * Token hanya dibutuhkan untuk sinkron. Bila refresh gagal, AuthRequiredError dilempar ke
 * sync engine — pekerjaan offline tetap berjalan sampai pengguna login ulang saat online.
 */
import type { z } from 'zod';

import type { SecureKV } from '../lib/secure-kv';
import {
  authTokenResponseSchema,
  type AuthTokenResponse,
  type authTokenRequestSchema,
} from './contract';
import { ApiError, type HttpClient, type RequestOptions } from './http';

export class AuthRequiredError extends Error {
  constructor(message = 'Sesi server berakhir — login ulang saat online') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export const TOKEN_KEYS = {
  access: 'auth.access_token',
  refresh: 'auth.refresh_token',
  expiresAt: 'auth.expires_at',
} as const;

/** Refresh lebih awal agar token tidak kedaluwarsa di tengah batch sinkron. */
const EXPIRY_MARGIN_MS = 60_000;

export class TokenStore {
  constructor(private readonly kv: SecureKV) {}

  async save(t: Pick<AuthTokenResponse, 'access_token' | 'refresh_token' | 'expires_in'>, nowMs: number) {
    await this.kv.set(TOKEN_KEYS.access, t.access_token);
    await this.kv.set(TOKEN_KEYS.refresh, t.refresh_token);
    await this.kv.set(TOKEN_KEYS.expiresAt, String(nowMs + t.expires_in * 1000));
  }

  async load() {
    const [access, refresh, expiresAt] = await Promise.all([
      this.kv.get(TOKEN_KEYS.access),
      this.kv.get(TOKEN_KEYS.refresh),
      this.kv.get(TOKEN_KEYS.expiresAt),
    ]);
    return { access, refresh, expiresAt: expiresAt ? Number(expiresAt) : 0 };
  }

  async clear() {
    await Promise.all(Object.values(TOKEN_KEYS).map((k) => this.kv.remove(k)));
  }
}

export class ApiClient {
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly http: HttpClient,
    readonly tokens: TokenStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** POST /auth/token — tidak menyimpan token; pemanggil memutuskan setelah validasi lokal. */
  login(body: z.input<typeof authTokenRequestSchema>): Promise<AuthTokenResponse> {
    return this.http.request('POST', '/auth/token', { body, schema: authTokenResponseSchema });
  }

  async request<T>(method: string, path: string, options: RequestOptions<T>): Promise<T> {
    let token = await this.validAccessToken();
    try {
      return await this.http.request(method, path, this.withAuth(options, token));
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      token = await this.refresh();
      return this.http.request(method, path, this.withAuth(options, token));
    }
  }

  private withAuth<T>(options: RequestOptions<T>, token: string): RequestOptions<T> {
    return { ...options, headers: { ...options.headers, authorization: `Bearer ${token}` } };
  }

  private async validAccessToken(): Promise<string> {
    const t = await this.tokens.load();
    if (t.access && t.expiresAt - EXPIRY_MARGIN_MS > this.now()) return t.access;
    if (!t.refresh) throw new AuthRequiredError();
    return this.refresh();
  }

  /** Single-flight: permintaan paralel berbagi satu refresh. */
  refresh(): Promise<string> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string> {
    const { refresh } = await this.tokens.load();
    if (!refresh) throw new AuthRequiredError();
    try {
      const res = await this.http.request('POST', '/auth/refresh', {
        body: { refresh_token: refresh },
        schema: authTokenResponseSchema,
      });
      await this.tokens.save(res, this.now());
      return res.access_token;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await this.tokens.clear();
        throw new AuthRequiredError();
      }
      throw err;
    }
  }
}
