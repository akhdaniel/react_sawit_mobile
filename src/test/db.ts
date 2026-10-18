/**
 * DB uji: better-sqlite3 in-memory + file migrasi drizzle-kit yang sama dengan di HP
 * (tanpa SQLCipher — enkripsi tidak memengaruhi skema/trigger).
 */
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from '@/db/schema';
import type { AppDatabase } from '@/db/types';

export function createTestDb(): { db: AppDatabase; sqlite: Database.Database } {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../db/migrations') });
  return { db: db as unknown as AppDatabase, sqlite };
}
