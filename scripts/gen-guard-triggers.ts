/**
 * Menghasilkan SQL trigger penjaga APPEND-ONLY untuk tabel transaksi dari skema Drizzle
 * dan peta TX_TRANSITIONS, sehingga aturan di DB selalu sama dengan aturan di TS.
 *
 * Pemakaian:
 *   npx drizzle-kit generate --custom --name=<nama>
 *   npx tsx scripts/gen-guard-triggers.ts src/db/migrations/<file>.sql
 *
 * Jika kolom/tabel transaksi berubah, buat migrasi custom baru: DROP trigger lama lalu
 * jalankan script ini lagi (pakai --drop untuk menyertakan DROP TRIGGER IF EXISTS).
 */
import { writeFileSync } from 'node:fs';

import { getTableConfig } from 'drizzle-orm/sqlite-core';

import { transactionTables } from '../src/db/schema/transactions';
import { MUTABLE_STATUSES, TX_STATUSES, TX_TRANSITIONS } from '../src/db/tx-status';

/** Kolom yang boleh diperbarui sync engine setelah transaksi terkirim. */
const META_COLUMNS = new Set(['status', 'reject_reason', 'server_id', 'sent_at', 'posted_at']);

const BREAK = '\n--> statement-breakpoint\n';
const q = (s: string) => `'${s}'`;
const list = (xs: readonly string[]) => xs.map(q).join(', ');

function guardsFor(table: string, columns: string[], drop: boolean): string[] {
  const business = columns.filter((c) => !META_COLUMNS.has(c));
  const changed = business.map((c) => `NEW.\`${c}\` IS NOT OLD.\`${c}\``).join(' OR ');
  const allowed = TX_STATUSES.filter((from) => TX_TRANSITIONS[from].length > 0)
    .map((from) => `(OLD.status = ${q(from)} AND NEW.status IN (${list(TX_TRANSITIONS[from])}))`)
    .join(' OR ');

  const out: string[] = [];
  const names = ['insert_status', 'immutable', 'transition', 'delete'].map((n) => `${table}_guard_${n}`);
  if (drop) out.push(...names.map((n) => `DROP TRIGGER IF EXISTS \`${n}\`;`));
  out.push(
    `CREATE TRIGGER \`${names[0]}\` BEFORE INSERT ON \`${table}\`
WHEN NEW.status NOT IN (${list(TX_STATUSES)})
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_STATUS'); END;`,
    `CREATE TRIGGER \`${names[1]}\` BEFORE UPDATE ON \`${table}\`
WHEN OLD.status NOT IN (${list(MUTABLE_STATUSES)}) AND (${changed})
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;`,
    `CREATE TRIGGER \`${names[2]}\` BEFORE UPDATE OF status ON \`${table}\`
WHEN NEW.status IS NOT OLD.status AND NOT (${allowed})
BEGIN SELECT RAISE(ABORT, 'TX_INVALID_TRANSITION'); END;`,
    `CREATE TRIGGER \`${names[3]}\` BEFORE DELETE ON \`${table}\`
WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;`,
  );
  return out;
}

function spbLineGuards(drop: boolean): string[] {
  const parentLocked = (ref: 'NEW' | 'OLD') =>
    `EXISTS (SELECT 1 FROM spb WHERE spb.mobile_uuid = ${ref}.spb_uuid AND spb.status NOT IN (${list(MUTABLE_STATUSES)}))`;
  const out: string[] = [];
  if (drop) {
    out.push(...['insert', 'update', 'delete'].map((n) => `DROP TRIGGER IF EXISTS \`spb_line_guard_${n}\`;`));
  }
  out.push(
    `CREATE TRIGGER \`spb_line_guard_insert\` BEFORE INSERT ON \`spb_line\`
WHEN ${parentLocked('NEW')}
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;`,
    `CREATE TRIGGER \`spb_line_guard_update\` BEFORE UPDATE ON \`spb_line\`
WHEN ${parentLocked('OLD')} OR ${parentLocked('NEW')}
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;`,
    `CREATE TRIGGER \`spb_line_guard_delete\` BEFORE DELETE ON \`spb_line\`
WHEN ${parentLocked('OLD')}
BEGIN SELECT RAISE(ABORT, 'TX_APPEND_ONLY'); END;`,
  );
  return out;
}

function photoGuards(drop: boolean): string[] {
  const immutable = ['id', 'sha256', 'size_bytes', 'taken_trusted_at', 'lat', 'lng', 'accuracy_m', 'mocked'];
  const out: string[] = [];
  if (drop) {
    out.push(...['immutable', 'delete'].map((n) => `DROP TRIGGER IF EXISTS \`photo_guard_${n}\`;`));
  }
  out.push(
    // Bukti foto (hash, waktu, lokasi) tidak boleh diubah setelah diambil.
    `CREATE TRIGGER \`photo_guard_immutable\` BEFORE UPDATE ON \`photo\`
WHEN ${immutable.map((c) => `NEW.\`${c}\` IS NOT OLD.\`${c}\``).join(' OR ')}
BEGIN SELECT RAISE(ABORT, 'PHOTO_IMMUTABLE'); END;`,
    `CREATE TRIGGER \`photo_guard_delete\` BEFORE DELETE ON \`photo\`
WHEN OLD.upload_status = 'uploaded'
BEGIN SELECT RAISE(ABORT, 'PHOTO_IMMUTABLE'); END;`,
  );
  return out;
}

export function buildGuardSql(drop = false): string {
  const statements: string[] = [];
  for (const table of Object.values(transactionTables)) {
    const cfg = getTableConfig(table);
    statements.push(...guardsFor(cfg.name, cfg.columns.map((c) => c.name), drop));
  }
  statements.push(...spbLineGuards(drop), ...photoGuards(drop));
  return `-- DIHASILKAN OLEH scripts/gen-guard-triggers.ts — jangan diedit manual.\n${statements.join(BREAK)}\n`;
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Pemakaian: tsx scripts/gen-guard-triggers.ts <file.sql> [--drop]');
    process.exit(1);
  }
  writeFileSync(target, buildGuardSql(process.argv.includes('--drop')));
  console.log(`Trigger ditulis ke ${target}`);
}
