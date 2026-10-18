/**
 * Tiket panen.
 *
 * - Pemanen wajib sudah check-in hadir hari itu.
 * - Satu TPH + satu pemanen + satu tanggal = satu tiket; tiket berikutnya otomatis
 *   ditandai susulan (is_late_entry).
 * - Nomor tiket dibuat offline: <kode_afdeling>-<yyMMdd>-<device_short>-<seq>.
 * - Koreksi = tiket baru (nomor baru) dengan correction_of; tiket asal tidak diubah.
 * - Status turunan: terangkut bila sudah masuk SPB (tidak ditolak); bila belum di akhir
 *   hari = potensi restan.
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { afdeling, block, employee, harvestTicket, spb, spbLine, tph } from '../schema';
import type { AppDatabase } from '../types';
import { presentEmployeeIds } from './attendance';
import { insertPhoto, linkPhoto, type NewPhoto } from './photos';
import { nextDocNo } from './sequence';

export type HarvestTicketRow = typeof harvestTicket.$inferSelect;
export type NewHarvestTicket = typeof harvestTicket.$inferInsert;

/** Tiket efektif: tidak ditolak dan tidak digantikan koreksi. */
export function effectiveTickets(db: AppDatabase, workDate?: string): HarvestTicketRow[] {
  const conds = [ne(harvestTicket.status, 'rejected')];
  if (workDate) conds.push(eq(harvestTicket.workDate, workDate));
  const rows = db.select().from(harvestTicket).where(and(...conds)).orderBy(desc(harvestTicket.createdTrustedAt)).all();
  const superseded = new Set(rows.map((r) => r.correctionOf).filter((x): x is string => !!x));
  return rows.filter((r) => !superseded.has(r.mobileUuid));
}

/** Tiket efektif lain untuk TPH + pemanen + tanggal yang sama (penentu susulan). */
export function findDuplicateTicket(
  db: AppDatabase,
  workDate: string,
  tphId: number,
  harvesterEmployeeId: number,
  excludeUuid?: string,
): HarvestTicketRow | null {
  return (
    effectiveTickets(db, workDate).find(
      (t) => t.tphId === tphId && t.harvesterEmployeeId === harvesterEmployeeId && t.mobileUuid !== excludeUuid,
    ) ?? null
  );
}

export type HarvestErrorCode =
  | 'harvester_not_present'
  | 'unknown_tph'
  | 'tph_block_mismatch'
  | 'block_not_tm'
  | 'empty_ticket'
  | 'invalid_count'
  | 'correction_target_invalid';

export interface HarvestInput {
  workDate: string;
  tphId: number;
  blockId: number;
  harvesterEmployeeId: number;
  ripe: number;
  unripe: number;
  rotten: number;
  emptyBunch: number;
  longStalk: number;
  looseFruitKg: number;
  correctionOf?: string | null;
}

export function validateTicket(db: AppDatabase, input: HarvestInput): HarvestErrorCode[] {
  const issues: HarvestErrorCode[] = [];
  const ints = [input.ripe, input.unripe, input.rotten, input.emptyBunch, input.longStalk];
  if (ints.some((n) => !Number.isInteger(n) || n < 0) || !(input.looseFruitKg >= 0)) issues.push('invalid_count');
  else if (input.ripe + input.unripe + input.rotten === 0 && input.looseFruitKg === 0) issues.push('empty_ticket');

  const t = db.select().from(tph).where(eq(tph.id, input.tphId)).get();
  if (!t) issues.push('unknown_tph');
  else if (t.blockId !== input.blockId) issues.push('tph_block_mismatch');
  const b = db.select().from(block).where(eq(block.id, input.blockId)).get();
  if (b && b.status !== 'TM') issues.push('block_not_tm');

  if (!presentEmployeeIds(db, input.workDate).has(input.harvesterEmployeeId)) issues.push('harvester_not_present');

  if (input.correctionOf && !canCorrect(db, input.correctionOf)) issues.push('correction_target_invalid');
  return issues;
}

/** Tiket boleh dikoreksi bila ada dan belum punya koreksi yang tidak ditolak (termasuk tiket ditolak server). */
export function canCorrect(db: AppDatabase, mobileUuid: string): boolean {
  const target = db.select({ u: harvestTicket.mobileUuid }).from(harvestTicket).where(eq(harvestTicket.mobileUuid, mobileUuid)).get();
  if (!target) return false;
  const existing = db
    .select({ u: harvestTicket.mobileUuid })
    .from(harvestTicket)
    .where(and(eq(harvestTicket.correctionOf, mobileUuid), ne(harvestTicket.status, 'rejected')))
    .get();
  return !existing;
}

export interface CreatedTicket {
  mobileUuid: string;
  ticketNo: string;
  isLateEntry: boolean;
  estKg: number;
}

/**
 * Simpan tiket secara atomik: alokasi nomor + baris tiket + foto (opsional).
 * `common` = kolom umum dari tx-factory; `estKg` dihitung pemanggil (features/harvest/calc).
 */
export function createTicket(
  db: AppDatabase,
  common: Omit<NewHarvestTicket, 'workDate' | 'ticketNo' | 'tphId' | 'blockId' | 'harvesterEmployeeId' | 'estKg'>,
  input: HarvestInput,
  estKg: number,
  deviceShort: string,
  photoRow?: NewPhoto,
): CreatedTicket {
  let created!: CreatedTicket;
  db.transaction((tx) => {
    const t = tx as unknown as AppDatabase;
    const afd = t
      .select({ code: afdeling.code })
      .from(block)
      .innerJoin(afdeling, eq(afdeling.id, block.afdelingId))
      .where(eq(block.id, input.blockId))
      .get();
    if (!afd) throw new Error('Blok tidak dikenal');
    const ticketNo = nextDocNo(t, 'harvest_ticket', afd.code, input.workDate, deviceShort);
    let isLateEntry: boolean;
    if (input.correctionOf) {
      isLateEntry = t.select({ l: harvestTicket.isLateEntry }).from(harvestTicket).where(eq(harvestTicket.mobileUuid, input.correctionOf)).get()?.l ?? false;
    } else {
      isLateEntry = findDuplicateTicket(t, input.workDate, input.tphId, input.harvesterEmployeeId) != null;
    }
    if (photoRow) insertPhoto(t, photoRow);
    t.insert(harvestTicket)
      .values({
        ...common,
        correctionOf: input.correctionOf ?? null,
        workDate: input.workDate,
        ticketNo,
        tphId: input.tphId,
        blockId: input.blockId,
        harvesterEmployeeId: input.harvesterEmployeeId,
        ripe: input.ripe,
        unripe: input.unripe,
        rotten: input.rotten,
        emptyBunch: input.emptyBunch,
        longStalk: input.longStalk,
        looseFruitKg: input.looseFruitKg,
        estKg,
        photoId: photoRow?.id ?? null,
        isLateEntry,
      })
      .run();
    if (photoRow) linkPhoto(t, photoRow.id, common.mobileUuid);
    created = { mobileUuid: common.mobileUuid, ticketNo, isLateEntry, estKg };
  });
  return created;
}

/** UUID tiket yang sudah masuk SPB yang tidak ditolak. */
export function transportedTicketUuids(db: AppDatabase): Set<string> {
  const rows = db
    .select({ u: spbLine.harvestTicketUuid })
    .from(spbLine)
    .innerJoin(spb, eq(spb.mobileUuid, spbLine.spbUuid))
    .where(ne(spb.status, 'rejected'))
    .all();
  return new Set(rows.map((r) => r.u));
}

export interface TicketView extends HarvestTicketRow {
  tphCode: string;
  blockCode: string;
  harvesterName: string;
  transported: boolean;
}

export function ticketViews(db: AppDatabase, workDate: string): TicketView[] {
  const rows = effectiveTickets(db, workDate);
  return decorate(db, rows);
}

export function ticketView(db: AppDatabase, mobileUuid: string): TicketView | null {
  const row = db.select().from(harvestTicket).where(eq(harvestTicket.mobileUuid, mobileUuid)).get();
  return row ? (decorate(db, [row])[0] ?? null) : null;
}

function decorate(db: AppDatabase, rows: HarvestTicketRow[]): TicketView[] {
  if (rows.length === 0) return [];
  const tphs = new Map(db.select().from(tph).where(inArray(tph.id, rows.map((r) => r.tphId))).all().map((x) => [x.id, x.code]));
  const blocks = new Map(db.select().from(block).where(inArray(block.id, rows.map((r) => r.blockId))).all().map((x) => [x.id, x.code]));
  const emps = new Map(
    db.select().from(employee).where(inArray(employee.id, rows.map((r) => r.harvesterEmployeeId))).all().map((x) => [x.id, x.name]),
  );
  const moved = transportedTicketUuids(db);
  return rows.map((r) => ({
    ...r,
    tphCode: tphs.get(r.tphId) ?? `#${r.tphId}`,
    blockCode: blocks.get(r.blockId) ?? `#${r.blockId}`,
    harvesterName: emps.get(r.harvesterEmployeeId) ?? `#${r.harvesterEmployeeId}`,
    transported: moved.has(r.mobileUuid),
  }));
}
