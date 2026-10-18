import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

export type Schema = typeof schema;

/**
 * Database sinkron (expo-sqlite di HP, better-sqlite3 di unit test).
 * Repository menerima tipe ini agar bisa diuji tanpa perangkat.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', any, Schema>;
