/**
 * State in-memory mock server: master ber-versi (untuk delta cursor), token, transaksi
 * (idempoten per mobile_uuid), foto, keputusan approval, heartbeat.
 */
import { createHash, randomBytes } from 'node:crypto';

import {
  MASTER_ENTITY_NAMES,
  type MasterEntityName,
  type TxItem,
  type TxTypeName,
} from '../../src/sync/contract';
import { buildSeed, jakartaDate, type SeedMaster, type SeedUser } from './seed';

type AnyRecord = { id: number } & Record<string, unknown>;

interface Versioned {
  entity: MasterEntityName;
  id: number;
  v: number;
  record: AnyRecord | null; // null = dihapus (tombstone)
}

export interface StoredTx {
  item: TxItem;
  status: 'accepted' | 'rejected';
  serverId: number | null;
  reason: string | null;
  flags: string[];
  receivedAt: number;
  userId: number;
}

export interface StoredPhoto {
  photoId: number;
  mobileUuidPhoto: string;
  transactionUuid: string;
  sha256: string;
  size: number;
}

interface Session {
  user: SeedUser;
  deviceId: string;
  expiresAt: number;
}

export interface StoreOptions {
  accessTtlSec: number;
  /** Jeda sebelum transaksi accepted dianggap posted ke jurnal (ms). */
  postDelayMs: number;
  /** Jumlah maksimum record per halaman GET /master. */
  masterPageSize: number;
  now: () => number;
}

export const DEFAULT_OPTIONS: StoreOptions = {
  accessTtlSec: 3600,
  postDelayMs: 60_000,
  masterPageSize: 1000,
  now: () => Date.now(),
};

export class Store {
  readonly opts: StoreOptions;
  users: SeedUser[] = [];
  private version = 0;
  private rows = new Map<string, Versioned>();
  private access = new Map<string, Session>();
  private refresh = new Map<string, Session>();
  transactions = new Map<string, StoredTx>();
  photos = new Map<string, StoredPhoto>();
  decisions = new Map<string, { targetUuid: string; decision: string; userId: number }>();
  heartbeats = new Map<string, Record<string, unknown>>();
  private nextServerId = 1;
  private nextPhotoId = 1;
  /** Gangguan buatan untuk menguji sync engine. */
  faults = { failRate: 0, latencyMs: 0 };

  constructor(opts: Partial<StoreOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.reset();
  }

  reset(): void {
    const seed = buildSeed(jakartaDate(new Date(this.opts.now())));
    this.users = seed.users;
    this.version = 0;
    this.rows.clear();
    this.access.clear();
    this.refresh.clear();
    this.transactions.clear();
    this.photos.clear();
    this.decisions.clear();
    this.heartbeats.clear();
    this.nextServerId = 1;
    this.nextPhotoId = 1;
    for (const entity of MASTER_ENTITY_NAMES) {
      for (const record of seed.master[entity] as AnyRecord[]) this.upsertMaster(entity, record);
    }
  }

  // ---- Master ------------------------------------------------------------
  private key(entity: MasterEntityName, id: number) {
    return `${entity}:${id}`;
  }

  upsertMaster(entity: MasterEntityName, record: AnyRecord): void {
    this.rows.set(this.key(entity, record.id), { entity, id: record.id, v: ++this.version, record: { ...record } });
  }

  patchMaster(entity: MasterEntityName, id: number, patch: Record<string, unknown>): AnyRecord | null {
    const cur = this.getMaster(entity, id);
    if (!cur) return null;
    const next = { ...cur, ...patch, id };
    this.upsertMaster(entity, next);
    return next;
  }

  deleteMaster(entity: MasterEntityName, id: number): boolean {
    if (!this.getMaster(entity, id)) return false;
    this.rows.set(this.key(entity, id), { entity, id, v: ++this.version, record: null });
    return true;
  }

  getMaster<T extends AnyRecord = AnyRecord>(entity: MasterEntityName, id: number): T | null {
    return (this.rows.get(this.key(entity, id))?.record as T | undefined) ?? null;
  }

  listMaster<T extends AnyRecord = AnyRecord>(entity: MasterEntityName): T[] {
    const out: T[] = [];
    for (const r of this.rows.values()) if (r.entity === entity && r.record) out.push(r.record as T);
    return out.sort((a, b) => a.id - b.id);
  }

  /**
   * Delta sejak cursor (versi). Cursor kosong = snapshot penuh (tanpa tombstone).
   * Halaman dibatasi masterPageSize; has_more = true bila masih ada sisa.
   */
  masterSince(since: string | undefined) {
    let from = since ? Number(since) : 0;
    if (!Number.isInteger(from) || from < 0) throw new Error('cursor tidak valid');
    // Cursor dari server lama (setelah reset) → kirim snapshot penuh.
    if (from > this.version) from = 0;
    const pending = [...this.rows.values()]
      .filter((r) => r.v > from && (from > 0 || r.record))
      .sort((a, b) => a.v - b.v);
    const page = pending.slice(0, this.opts.masterPageSize);
    const changes: Partial<Record<MasterEntityName, { upserts: AnyRecord[]; deletes: number[] }>> = {};
    for (const r of page) {
      const c = (changes[r.entity] ??= { upserts: [], deletes: [] });
      if (r.record) c.upserts.push(r.record);
      else c.deletes.push(r.id);
    }
    const last = page.at(-1)?.v ?? Math.max(from, this.version);
    return { cursor: String(last), has_more: pending.length > page.length, changes };
  }

  // ---- Auth --------------------------------------------------------------
  login(login: string, password: string, deviceId: string) {
    const user = this.users.find((u) => u.login === login && u.password === password);
    return user ? this.issue(user, deviceId) : null;
  }

  refreshToken(token: string) {
    const s = this.refresh.get(token);
    if (!s) return null;
    this.refresh.delete(token); // rotasi: refresh token sekali pakai
    return this.issue(s.user, s.deviceId);
  }

  private issue(user: SeedUser, deviceId: string) {
    const accessToken = randomBytes(24).toString('hex');
    const refreshToken = randomBytes(24).toString('hex');
    const session = { user, deviceId, expiresAt: this.opts.now() + this.opts.accessTtlSec * 1000 };
    this.access.set(accessToken, session);
    this.refresh.set(refreshToken, { ...session, expiresAt: Number.MAX_SAFE_INTEGER });
    const { password: _pw, login: _login, ...publicUser } = user;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: this.opts.accessTtlSec,
      user: publicUser,
    };
  }

  authenticate(token: string | undefined): Session | null {
    if (!token) return null;
    const s = this.access.get(token);
    if (!s) return null;
    if (s.expiresAt <= this.opts.now()) {
      this.access.delete(token);
      return null;
    }
    return s;
  }

  /** Paksa semua access token kedaluwarsa (uji alur 401 → refresh). */
  expireAllAccessTokens(): void {
    this.access.clear();
  }

  // ---- Transaksi ---------------------------------------------------------
  allocServerId(): number {
    return this.nextServerId++;
  }

  serverStatus(uuid: string) {
    const tx = this.transactions.get(uuid);
    if (!tx) return { mobile_uuid: uuid, status: 'unknown' as const, reason: null, posted_at: null };
    if (tx.status === 'rejected') return { mobile_uuid: uuid, status: 'rejected' as const, reason: tx.reason, posted_at: null };
    const postedAt = tx.receivedAt + this.opts.postDelayMs;
    if (this.opts.now() >= postedAt) {
      return { mobile_uuid: uuid, status: 'posted' as const, reason: null, posted_at: new Date(postedAt).toISOString() };
    }
    return { mobile_uuid: uuid, status: 'accepted' as const, reason: null, posted_at: null };
  }

  acceptedOfType<T extends TxTypeName>(type: T): Extract<TxItem, { type: T }>[] {
    const out: Extract<TxItem, { type: T }>[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.status === 'accepted' && tx.item.type === type) out.push(tx.item as Extract<TxItem, { type: T }>);
    }
    return out;
  }

  // ---- Foto --------------------------------------------------------------
  savePhoto(mobileUuidPhoto: string, transactionUuid: string, sha256: string, data: Buffer): StoredPhoto | { error: string } {
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== sha256) return { error: 'sha256_mismatch' };
    const existing = this.photos.get(mobileUuidPhoto);
    if (existing) return existing; // idempoten
    const p = { photoId: this.nextPhotoId++, mobileUuidPhoto, transactionUuid, sha256, size: data.length };
    this.photos.set(mobileUuidPhoto, p);
    return p;
  }
}

export type MasterSeed = SeedMaster;
