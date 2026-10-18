import { eq } from 'drizzle-orm';

import { appMeta } from '../schema';
import type { AppDatabase } from '../types';

export const META_KEYS = {
  deviceId: 'device_id',
  deviceShort: 'device_short',
  lastSyncAt: 'last_sync_at',
} as const;
export type MetaKey = (typeof META_KEYS)[keyof typeof META_KEYS];

export function getMeta(db: AppDatabase, key: MetaKey): string | null {
  return db.select().from(appMeta).where(eq(appMeta.key, key)).get()?.value ?? null;
}

export function setMeta(db: AppDatabase, key: MetaKey, value: string): void {
  db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } }).run();
}
