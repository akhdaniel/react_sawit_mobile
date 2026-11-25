/**
 * Sesi pengguna offline-first.
 *
 * - Login pertama WAJIB online (POST /auth/token). Setelah itu aplikasi dibuka dengan PIN
 *   dan berjalan penuh tanpa sinyal. Token server hanya untuk sinkron.
 * - PIN disimpan sebagai SHA-256(salt + PIN) di secure store, dengan lockout bertahap;
 *   setelah MAX_PIN_FAILURES gagal, sesi dihapus dan pengguna harus login online lagi
 *   (data transaksi di HP tidak dihapus).
 * - Ganti pengguna / logout ditolak selama masih ada data milik pengguna lama yang belum
 *   terkirim, agar transaksi tidak tertinggal tanpa pemilik.
 * - Pindah server (server_id berbeda) juga ditolak selama ada data belum terkirim: data itu milik
 *   server lama. Setelah pindah server atau ganti pengguna, data server/pengguna lama di HP (master,
 *   antrean verifikasi, approval) dibersihkan dan PIN dibuat ulang. Riwayat transaksi tetap.
 */
import { authUserSchema, type AuthUser } from '../../sync/contract';
import { ApiError, NetworkError } from '../../sync/http';
import type { ApiClient } from '../../sync/api-client';
import type { SecureKV } from '../../lib/secure-kv';

export const SESSION_KEYS = {
  user: 'auth.user',
  /** Nama login, untuk login ulang ke server saat token habis. */
  login: 'auth.login',
  pin: 'auth.pin',
  pinFailures: 'auth.pin_failures',
} as const;

export const PIN_MIN = 4;
export const PIN_MAX = 6;
/** Gagal ke-N mulai dikunci sementara. */
export const PIN_LOCK_AFTER = 5;
/** Gagal sebanyak ini → sesi dihapus. */
export const MAX_PIN_FAILURES = 10;
const BASE_LOCK_MS = 30_000;

export type SessionErrorCode =
  | 'offline'
  | 'invalid_credentials'
  | 'server_error'
  | 'pending_other_user'
  | 'pending_other_server'
  | 'pending_data'
  | 'invalid_pin_format';

export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export interface SessionDeps {
  kv: SecureKV;
  api: ApiClient;
  /** SHA-256 hex. */
  sha256(text: string): Promise<string>;
  randomHex(bytes: number): string;
  /** Waktu monotonic/trusted (ms) — untuk lockout, tidak bisa diakali dengan ubah jam HP. */
  now(): number;
  device(): { deviceId: string; deviceModel: string; appVersion: string };
  /** Transaksi dan foto yang belum terkirim. */
  pendingCount(): number;
  lastUserId(): number | null;
  setLastUserId(id: number | null): void;
  /** server_id server yang datanya ada di HP (null: belum diketahui). */
  serverId(): string | null;
  setServerId(id: string | null): void;
  /** Hapus data milik server/pengguna di HP (master, antrean, approval); transaksi tidak disentuh. */
  resetLocalData(): void;
}

export interface StoredSession {
  user: AuthUser;
  hasPin: boolean;
}

interface PinRecord {
  salt: string;
  hash: string;
}

interface FailureRecord {
  count: number;
  lockedUntil: number;
}

export type PinVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong'; remainingBeforeWipe: number; lockedUntil: number | null }
  | { ok: false; reason: 'locked'; lockedUntil: number }
  | { ok: false; reason: 'wiped' };

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

/** Lama kunci setelah kegagalan ke-n (n ≥ PIN_LOCK_AFTER): 30 dtk, 60, 120, … */
export function lockDurationMs(failures: number): number {
  if (failures < PIN_LOCK_AFTER) return 0;
  return BASE_LOCK_MS * 2 ** (failures - PIN_LOCK_AFTER);
}

export class SessionService {
  constructor(private readonly d: SessionDeps) {}

  async restore(): Promise<StoredSession | null> {
    const raw = await this.d.kv.get(SESSION_KEYS.user);
    if (!raw) return null;
    const parsed = authUserSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return { user: parsed.data, hasPin: (await this.d.kv.get(SESSION_KEYS.pin)) != null };
  }

  /**
   * @param expectedUserId bila diisi (login ulang), akun lain ditolak SEBELUM sesi disimpan.
   */
  async login(login: string, password: string, expectedUserId?: number): Promise<StoredSession> {
    const device = this.d.device();
    let res;
    try {
      res = await this.d.api.login({
        login: login.trim(),
        password,
        device_id: device.deviceId,
        device_model: device.deviceModel,
        app_version: device.appVersion,
      });
    } catch (err) {
      if (err instanceof NetworkError) throw new SessionError('offline', 'Tidak bisa menghubungi server. Login pertama butuh koneksi.');
      if (err instanceof ApiError && err.status === 401) throw new SessionError('invalid_credentials', 'Login atau password salah');
      throw new SessionError('server_error', err instanceof Error ? err.message : 'Kesalahan server');
    }

    if (expectedUserId != null && res.user.id !== expectedUserId) {
      throw new SessionError(
        'pending_other_user',
        'Akun berbeda dengan pengguna aktif. Login ulang memakai akun yang sama, atau keluar dulu lewat menu Akun untuk berganti pengguna.',
      );
    }

    // Server lama tanpa server_id: dianggap server yang sama (perilaku sebelumnya).
    const knownServer = this.d.serverId();
    const serverChanged = res.server_id != null && knownServer != null && res.server_id !== knownServer;
    if (serverChanged && this.d.pendingCount() > 0) {
      throw new SessionError(
        'pending_other_server',
        'Masih ada data yang belum terkirim ke server sebelumnya. Kembalikan alamat server lama, lalu sinkronkan dulu.',
      );
    }
    // Id pengguna hanya bermakna di server yang sama.
    const previous = serverChanged ? null : this.d.lastUserId();
    const switching = previous != null && previous !== res.user.id;
    if (switching && this.d.pendingCount() > 0) {
      throw new SessionError('pending_other_user', 'Masih ada data pengguna sebelumnya yang belum terkirim. Sinkronkan dulu dengan akun tersebut.');
    }

    await this.d.api.tokens.save(res, this.d.now());
    await this.d.kv.set(SESSION_KEYS.user, JSON.stringify(res.user));
    await this.d.kv.set(SESSION_KEYS.login, login.trim());
    if (serverChanged || switching) this.d.resetLocalData();
    if (res.server_id) this.d.setServerId(res.server_id);
    this.d.setLastUserId(res.user.id);
    if (serverChanged || switching) await this.clearPin();
    return { user: res.user, hasPin: (await this.d.kv.get(SESSION_KEYS.pin)) != null };
  }

  /**
   * Token server habis (refresh ditolak): login ulang dengan password untuk pengguna yang
   * sama, tanpa mengganggu PIN dan data offline.
   */
  async reauthenticate(password: string, loginOverride?: string): Promise<StoredSession> {
    // Sesi dari versi lama (sebelum nama login disimpan) → nama login diminta dari pengguna.
    const login = loginOverride?.trim() || (await this.d.kv.get(SESSION_KEYS.login));
    const current = await this.restore();
    if (!current) throw new SessionError('invalid_credentials', 'Sesi tidak ditemukan. Silakan login ulang.');
    if (!login) throw new SessionError('invalid_credentials', 'Nama pengguna wajib diisi.');
    return this.login(login, password, current.user.id);
  }

  /** Nama login pengguna aktif. */
  loginName(): Promise<string | null> {
    return this.d.kv.get(SESSION_KEYS.login);
  }

  async setPin(pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new SessionError('invalid_pin_format', `PIN harus ${PIN_MIN}–${PIN_MAX} angka`);
    const salt = this.d.randomHex(16);
    const record: PinRecord = { salt, hash: await this.d.sha256(salt + pin) };
    await this.d.kv.set(SESSION_KEYS.pin, JSON.stringify(record));
    await this.d.kv.remove(SESSION_KEYS.pinFailures);
  }

  async pinLockedUntil(): Promise<number | null> {
    const f = await this.failures();
    return f.lockedUntil > this.d.now() ? f.lockedUntil : null;
  }

  async verifyPin(pin: string): Promise<PinVerifyResult> {
    const raw = await this.d.kv.get(SESSION_KEYS.pin);
    if (!raw) return { ok: false, reason: 'wiped' };
    const f = await this.failures();
    if (f.lockedUntil > this.d.now()) return { ok: false, reason: 'locked', lockedUntil: f.lockedUntil };

    const record = JSON.parse(raw) as PinRecord;
    if ((await this.d.sha256(record.salt + pin)) === record.hash) {
      await this.d.kv.remove(SESSION_KEYS.pinFailures);
      return { ok: true };
    }

    const count = f.count + 1;
    if (count >= MAX_PIN_FAILURES) {
      await this.wipe();
      return { ok: false, reason: 'wiped' };
    }
    const lock = lockDurationMs(count);
    const lockedUntil = lock > 0 ? this.d.now() + lock : 0;
    await this.d.kv.set(SESSION_KEYS.pinFailures, JSON.stringify({ count, lockedUntil } satisfies FailureRecord));
    return { ok: false, reason: 'wrong', remainingBeforeWipe: MAX_PIN_FAILURES - count, lockedUntil: lockedUntil || null };
  }

  async logout(): Promise<void> {
    if (this.d.pendingCount() > 0) {
      throw new SessionError('pending_data', 'Masih ada data belum terkirim. Lakukan sinkron sebelum keluar.');
    }
    await this.wipe();
  }

  /**
   * Pindah ke server lain: hanya bila tidak ada data belum terkirim (data itu milik server lama).
   * Sesi, PIN, dan data server/pengguna lama dihapus; pengguna login ulang di server baru.
   */
  async leaveServer(): Promise<void> {
    if (this.d.pendingCount() > 0) {
      throw new SessionError('pending_data', 'Masih ada data belum terkirim ke server lama. Sinkronkan dulu sebelum pindah server.');
    }
    await this.wipe();
    this.d.resetLocalData();
    this.d.setLastUserId(null);
    this.d.setServerId(null);
  }

  /**
   * Lupa PIN: hapus sesi lokal sehingga wajib login ulang online (password membuktikan
   * identitas) lalu membuat PIN baru. Data belum terkirim tetap aman dan last_user_id
   * dipertahankan, jadi aturan ganti pengguna tetap berlaku.
   */
  async resetForRelogin(): Promise<void> {
    await this.wipe();
  }

  /** Hapus sesi lokal (token, profil, PIN). Data transaksi tidak disentuh. */
  private async wipe(): Promise<void> {
    await this.d.api.tokens.clear();
    await this.d.kv.remove(SESSION_KEYS.user);
    await this.d.kv.remove(SESSION_KEYS.login);
    await this.clearPin();
  }

  private async clearPin(): Promise<void> {
    await this.d.kv.remove(SESSION_KEYS.pin);
    await this.d.kv.remove(SESSION_KEYS.pinFailures);
  }

  private async failures(): Promise<FailureRecord> {
    const raw = await this.d.kv.get(SESSION_KEYS.pinFailures);
    return raw ? (JSON.parse(raw) as FailureRecord) : { count: 0, lockedUntil: 0 };
  }
}
