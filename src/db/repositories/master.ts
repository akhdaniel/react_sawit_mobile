/**
 * Penerapan delta master dari server. HP tidak pernah menulis master di luar fungsi ini.
 */
import { count, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { MasterChanges } from '../../sync/contract';
import { MASTER_ENTITIES, masterTables, syncCursor, type MasterEntity } from '../schema';
import type { AppDatabase } from '../types';

export const MASTER_CURSOR_KEY = 'master';
const CHUNK = 200;

type Row = Record<string, unknown>;

/** Petakan record API (snake_case = nama kolom DB) ke key properti Drizzle (camelCase). */
export function apiRecordToRow(table: SQLiteTable, record: Row): Row {
  const row: Row = {};
  for (const [key, column] of Object.entries(getTableColumns(table)) as [string, SQLiteColumn][]) {
    if (column.name in record) row[key] = record[column.name] ?? null;
  }
  return row;
}

function upsertSet(table: SQLiteTable) {
  const set: Record<string, ReturnType<typeof sql.raw>> = {};
  for (const [key, column] of Object.entries(getTableColumns(table)) as [string, SQLiteColumn][]) {
    if (column.name !== 'id') set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

export interface ApplyMasterResult {
  upserted: number;
  deleted: number;
}

/**
 * Terapkan satu halaman delta master secara atomik bersama cursor barunya.
 * Bila gagal di tengah, cursor lama tetap berlaku sehingga tarik ulang aman.
 */
export function applyMasterChanges(db: AppDatabase, changes: MasterChanges, cursor: string): ApplyMasterResult {
  let upserted = 0;
  let deleted = 0;
  db.transaction((tx) => {
    for (const entity of MASTER_ENTITIES) {
      const delta = changes[entity];
      if (!delta) continue;
      const table = masterTables[entity];
      const idCol = getTableColumns(table).id as SQLiteColumn;
      const rows = (delta.upserts as Row[]).map((r) => apiRecordToRow(table, r));
      for (let i = 0; i < rows.length; i += CHUNK) {
        tx.insert(table)
          .values(rows.slice(i, i + CHUNK) as never)
          .onConflictDoUpdate({ target: idCol, set: upsertSet(table) })
          .run();
      }
      upserted += rows.length;
      for (let i = 0; i < delta.deletes.length; i += CHUNK) {
        tx.delete(table).where(inArray(idCol, delta.deletes.slice(i, i + CHUNK))).run();
      }
      deleted += delta.deletes.length;
    }
    setCursor(tx as unknown as AppDatabase, MASTER_CURSOR_KEY, cursor);
  });
  return { upserted, deleted };
}

export function getCursor(db: AppDatabase, entity = MASTER_CURSOR_KEY): string | null {
  const row = db.select().from(syncCursor).where(eq(syncCursor.entity, entity)).get();
  return row?.cursor ?? null;
}

export function setCursor(db: AppDatabase, entity: string, cursor: string): void {
  db.insert(syncCursor)
    .values({ entity, cursor })
    .onConflictDoUpdate({ target: syncCursor.entity, set: { cursor } })
    .run();
}

export function countMaster(db: AppDatabase): Record<MasterEntity, number> {
  const result = {} as Record<MasterEntity, number>;
  for (const entity of MASTER_ENTITIES) {
    const row = db.select({ n: count() }).from(masterTables[entity]).get();
    result[entity] = row?.n ?? 0;
  }
  return result;
}
