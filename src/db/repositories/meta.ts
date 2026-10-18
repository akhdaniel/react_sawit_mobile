import { eq } from 'drizzle-orm';

import { appMeta } from '../schema';
import type { AppDatabase } from '../types';

export const META_KEYS = {
  deviceId: 'device_id',
  deviceShort: 'device_short',
  lastSyncAt: 'last_sync_at',
  /** JSON SyncResult terakhir (lihat sync/engine). */
  lastSyncResult: 'last_sync_result',
  /** JSON TimeAnchor (lihat lib/trusted-time). */
  timeAnchor: 'time_anchor',
  /** URL API hasil override pengguna (default dari app.json). */
  apiBaseUrl: 'api_base_url',
  /** User terakhir yang login di HP ini. */
  lastUserId: 'last_user_id',
} as const;
export type MetaKey = (typeof META_KEYS)[keyof typeof META_KEYS];

export function getMeta(db: AppDatabase, key: MetaKey): string | null {
  return db.select().from(appMeta).where(eq(appMeta.key, key)).get()?.value ?? null;
}

export function setMeta(db: AppDatabase, key: MetaKey, value: string): void {
  db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } }).run();
}

export function deleteMeta(db: AppDatabase, key: MetaKey): void {
  db.delete(appMeta).where(eq(appMeta.key, key)).run();
}
