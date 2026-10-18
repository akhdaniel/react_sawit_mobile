import path from 'node:path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { createTestDb } from '@/test/db';

describe('migrasi', () => {
  it('membuat semua tabel master, transaksi, dan lokal', () => {
    const { sqlite } = createTestDb();
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name)
      .sort();
    expect(tables).toEqual(
      [
        'activity', 'afdeling', 'app_meta', 'approval_decision', 'assignment', 'attendance', 'block',
        'daily_report', 'doc_sequence', 'dosage_rule', 'employee', 'estate', 'gang', 'harvest_ticket',
        'material_usage', 'penalty_rule', 'photo', 'product', 'spb', 'spb_line', 'sync_cursor', 'tph',
        'upkeep', 'vehicle', 'work_plan',
      ].sort(),
    );
  });

  it('memasang trigger append-only untuk setiap tabel transaksi', () => {
    const { sqlite } = createTestDb();
    const n = (sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get() as { n: number }).n;
    // 8 tabel × 4 trigger + 3 spb_line + 2 photo
    expect(n).toBe(37);
  });

  it('idempoten: migrasi ulang pada DB yang sama tidak mengulang apa pun', () => {
    const { db, sqlite } = createTestDb();
    const applied = () => (sqlite.prepare('SELECT count(*) n FROM __drizzle_migrations').get() as { n: number }).n;
    const before = applied();
    expect(before).toBeGreaterThanOrEqual(2);
    migrate(db as never, { migrationsFolder: path.join(__dirname, '../migrations') });
    expect(applied()).toBe(before);
  });
});
