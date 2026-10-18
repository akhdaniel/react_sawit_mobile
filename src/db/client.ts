/**
 * Membuka database lokal terenkripsi SQLCipher dan menjalankan migrasi drizzle-kit.
 * Kunci DB = 32 byte acak per instalasi, disimpan di expo-secure-store (Android Keystore).
 */
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { getRandomBytesAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import migrations from './migrations/migrations';
import * as schema from './schema';

export const DB_NAME = 'xsm.db';
const DB_KEY_STORE = 'xsm_db_key_v1';
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type ExpoAppDatabase = ExpoSQLiteDatabase<typeof schema>;

export interface OpenedDatabase {
  db: ExpoAppDatabase;
  raw: SQLiteDatabase;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_STORE, SECURE_OPTS);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const key = toHex(await getRandomBytesAsync(32));
  await SecureStore.setItemAsync(DB_KEY_STORE, key, SECURE_OPTS);
  return key;
}

let opening: Promise<OpenedDatabase> | null = null;

/**
 * DB dibuka sekali per proses dan dipakai bersama oleh UI dan background task.
 * Bila gagal, percobaan berikutnya membuka ulang.
 */
export function getAppDatabase(): Promise<OpenedDatabase> {
  opening ??= openAppDatabase().catch((e: unknown) => {
    opening = null;
    throw e;
  });
  return opening;
}

async function openAppDatabase(): Promise<OpenedDatabase> {
  const key = await getOrCreateDbKey();
  // enableChangeListener wajib untuk useLiveQuery dan indikator data belum terkirim.
  const raw = openDatabaseSync(DB_NAME, { enableChangeListener: true });
  // Raw key (x'..') melewati PBKDF2 sehingga buka DB cepat; harus perintah pertama.
  raw.execSync(`PRAGMA key = "x'${key}'"`);
  // Gagal di sini = kunci salah / file bukan DB SQLCipher.
  raw.execSync('SELECT count(*) FROM sqlite_master');
  raw.execSync('PRAGMA journal_mode = WAL');
  raw.execSync('PRAGMA foreign_keys = ON');
  const db = drizzle(raw, { schema });
  await migrate(db, migrations);
  return { db, raw };
}
