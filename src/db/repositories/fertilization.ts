/**
 * Tiket pemupukan (struktur tiket pemupukan ERP): satu pekerja per tiket.
 *
 * - Kemandoran wajib jenis rawat; pekerja wajib sudah check-in hadir hari itu.
 * - Sub blok wajib (kelas medannya menentukan tarif upah).
 * - Pupuk wajib produk berkategori Pupuk yang punya kelompok pupuk (dasar tarif upah).
 * - Pokok dipupuk tidak melebihi pokok blok; pupuk tidak melebihi dosis standar × pokok,
 *   karena ERP tidak bisa memverifikasi tiket seperti itu.
 * - Nomor tiket dibuat ERP saat posting; koreksi = tiket baru dengan correction_of.
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { findRate } from '../../features/harvest/calc';
import {
  dosageStatus,
  fertilizationWage,
  findFertilizationLine,
  maxQtyKg,
  type DosageStatus,
  type FertilizationMethod,
  type FertilizationWage,
} from '../../features/fertilization/calc';
import { afdeling, block, employee, fertilizationTicket, gang, harvestRate, product, subBlok } from '../schema';
import type { AppDatabase } from '../types';
import { presentEmployeeIds } from './attendance';

export type FertilizationTicketRow = typeof fertilizationTicket.$inferSelect;
export type NewFertilizationTicket = typeof fertilizationTicket.$inferInsert;

export type FertilizationErrorCode =
  | 'unknown_block'
  | 'sub_blok_required'
  | 'sub_blok_mismatch'
  | 'gang_not_rawat'
  | 'worker_not_present'
  | 'unknown_fertilizer'
  | 'fertilizer_without_group'
  | 'invalid_tree_count'
  | 'tree_count_exceeds_block'
  | 'invalid_qty'
  | 'over_dose'
  | 'correction_target_invalid';

export interface FertilizationInput {
  workDate: string;
  blockId: number;
  subBlokId: number | null;
  gangId: number;
  workerEmployeeId: number;
  productId: number;
  method: FertilizationMethod;
  applicationRound: number | null;
  treeCount: number;
  qtyKg: number;
  weather: FertilizationTicketRow['weather'];
  notes: string | null;
  correctionOf?: string | null;
}

/** Tiket efektif: tidak ditolak dan tidak digantikan koreksi. */
export function effectiveFertilizationTickets(db: AppDatabase, workDate?: string): FertilizationTicketRow[] {
  const conds = [ne(fertilizationTicket.status, 'rejected')];
  if (workDate) conds.push(eq(fertilizationTicket.workDate, workDate));
  const rows = db.select().from(fertilizationTicket).where(and(...conds)).orderBy(desc(fertilizationTicket.createdTrustedAt)).all();
  const superseded = new Set(rows.map((r) => r.correctionOf).filter((x): x is string => !!x));
  return rows.filter((r) => !superseded.has(r.mobileUuid));
}

/** Kemandoran rawat di afdeling pengguna. */
export function rawatGangs(db: AppDatabase, afdelingIds: readonly number[]) {
  if (afdelingIds.length === 0) return [];
  return db
    .select()
    .from(gang)
    .where(and(inArray(gang.afdelingId, [...afdelingIds]), eq(gang.gangType, 'rawat')))
    .orderBy(gang.name)
    .all();
}

/** Pupuk yang bisa dipilih: produk berkategori Pupuk yang punya kelompok pupuk. */
export function fertilizers(db: AppDatabase) {
  return db
    .select()
    .from(product)
    .where(eq(product.isFertilizer, true))
    .orderBy(product.name)
    .all()
    .filter((p) => p.fertilizerGroupId != null);
}

export interface FertilizationEstimate {
  /** Pokok blok; null = tidak dibatasi. */
  treeLimit: number | null;
  dosageKgPerTree: number | null;
  maxQtyKg: number | null;
  dosageStatus: DosageStatus;
  /** Tarif ERP yang berlaku (estate blok + tipe karyawan pekerja + tanggal) ditemukan. */
  hasRate: boolean;
  wage: FertilizationWage;
}

/** Batas dosis dan estimasi upah dari master lokal, dengan aturan yang sama dengan tiket ERP. */
export function fertilizationEstimate(
  db: AppDatabase,
  input: Pick<FertilizationInput, 'workDate' | 'method' | 'treeCount' | 'qtyKg'> & {
    blockId: number | null;
    subBlokId: number | null;
    workerEmployeeId: number | null;
    productId: number | null;
  },
): FertilizationEstimate {
  const b = input.blockId
    ? db
        .select({ treeCount: block.treeCount, estateId: afdeling.estateId })
        .from(block)
        .innerJoin(afdeling, eq(afdeling.id, block.afdelingId))
        .where(eq(block.id, input.blockId))
        .get()
    : undefined;
  const prod = input.productId ? db.select().from(product).where(eq(product.id, input.productId)).get() : undefined;
  const dosage = prod?.dosageKgPerTree ?? null;
  const max = maxQtyKg(dosage, input.treeCount);
  const terrainClassId = input.subBlokId
    ? (db.select({ c: subBlok.terrainClassId }).from(subBlok).where(eq(subBlok.id, input.subBlokId)).get()?.c ?? null)
    : null;
  const employeeType = input.workerEmployeeId
    ? (db.select({ t: employee.employeeType }).from(employee).where(eq(employee.id, input.workerEmployeeId)).get()?.t ?? null)
    : null;
  const rate = input.workerEmployeeId
    ? findRate(db.select().from(harvestRate).all(), { workDate: input.workDate, estateId: b?.estateId ?? null, employeeType })
    : null;
  const line = rate
    ? findFertilizationLine(rate.fertilizationLines ?? [], {
        fertilizerGroupId: prod?.fertilizerGroupId ?? null,
        method: input.method,
        terrainClassId,
      })
    : null;
  return {
    treeLimit: b?.treeCount || null,
    dosageKgPerTree: dosage,
    maxQtyKg: max,
    dosageStatus: dosageStatus(input.qtyKg, max),
    hasRate: !!rate,
    wage: fertilizationWage(line, input),
  };
}

export function validateFertilization(db: AppDatabase, input: FertilizationInput): FertilizationErrorCode[] {
  const issues: FertilizationErrorCode[] = [];
  const b = db.select().from(block).where(eq(block.id, input.blockId)).get();
  if (!b) issues.push('unknown_block');
  if (input.subBlokId == null) issues.push('sub_blok_required');
  else {
    const sb = db.select().from(subBlok).where(eq(subBlok.id, input.subBlokId)).get();
    if (!sb || sb.blockId !== input.blockId) issues.push('sub_blok_mismatch');
  }
  const g = db.select().from(gang).where(eq(gang.id, input.gangId)).get();
  if (!g || g.gangType !== 'rawat') issues.push('gang_not_rawat');
  if (!presentEmployeeIds(db, input.workDate).has(input.workerEmployeeId)) issues.push('worker_not_present');

  const p = db.select().from(product).where(eq(product.id, input.productId)).get();
  if (!p || !p.isFertilizer) issues.push('unknown_fertilizer');
  else if (p.fertilizerGroupId == null) issues.push('fertilizer_without_group');

  if (!Number.isInteger(input.treeCount) || input.treeCount <= 0) issues.push('invalid_tree_count');
  else if (b?.treeCount && input.treeCount > b.treeCount) issues.push('tree_count_exceeds_block');
  if (!(input.qtyKg > 0)) issues.push('invalid_qty');
  else if (p && dosageStatus(input.qtyKg, maxQtyKg(p.dosageKgPerTree, input.treeCount)) === 'over') issues.push('over_dose');

  if (input.correctionOf && !canCorrectFertilization(db, input.correctionOf)) issues.push('correction_target_invalid');
  return issues;
}

/** Tiket boleh dikoreksi bila ada dan belum punya koreksi yang tidak ditolak. */
export function canCorrectFertilization(db: AppDatabase, mobileUuid: string): boolean {
  const target = db
    .select({ u: fertilizationTicket.mobileUuid })
    .from(fertilizationTicket)
    .where(eq(fertilizationTicket.mobileUuid, mobileUuid))
    .get();
  if (!target) return false;
  const existing = db
    .select({ u: fertilizationTicket.mobileUuid })
    .from(fertilizationTicket)
    .where(and(eq(fertilizationTicket.correctionOf, mobileUuid), ne(fertilizationTicket.status, 'rejected')))
    .get();
  return !existing;
}

export function createFertilizationTicket(
  db: AppDatabase,
  common: Omit<NewFertilizationTicket, keyof FertilizationInput>,
  input: FertilizationInput,
): string {
  db.insert(fertilizationTicket)
    .values({
      ...common,
      correctionOf: input.correctionOf ?? null,
      workDate: input.workDate,
      blockId: input.blockId,
      subBlokId: input.subBlokId,
      gangId: input.gangId,
      workerEmployeeId: input.workerEmployeeId,
      productId: input.productId,
      method: input.method,
      applicationRound: input.applicationRound,
      treeCount: input.treeCount,
      qtyKg: input.qtyKg,
      weather: input.weather,
      notes: input.notes?.trim() || null,
    })
    .run();
  return common.mobileUuid;
}

export interface FertilizationView extends FertilizationTicketRow {
  blockCode: string;
  subBlokCode: string | null;
  workerName: string;
  productName: string;
}

export function fertilizationViews(db: AppDatabase, workDate: string): FertilizationView[] {
  return decorate(db, effectiveFertilizationTickets(db, workDate));
}

export function fertilizationView(db: AppDatabase, mobileUuid: string): FertilizationView | null {
  const row = db.select().from(fertilizationTicket).where(eq(fertilizationTicket.mobileUuid, mobileUuid)).get();
  return row ? (decorate(db, [row])[0] ?? null) : null;
}

function decorate(db: AppDatabase, rows: FertilizationTicketRow[]): FertilizationView[] {
  if (rows.length === 0) return [];
  const byId = <T extends { id: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const blocks = byId(db.select().from(block).where(inArray(block.id, rows.map((r) => r.blockId))).all());
  const subs = byId(
    db.select().from(subBlok).where(inArray(subBlok.id, rows.map((r) => r.subBlokId).filter((x): x is number => x != null))).all(),
  );
  const emps = byId(db.select().from(employee).where(inArray(employee.id, rows.map((r) => r.workerEmployeeId))).all());
  const prods = byId(db.select().from(product).where(inArray(product.id, rows.map((r) => r.productId))).all());
  return rows.map((r) => ({
    ...r,
    blockCode: blocks.get(r.blockId)?.code ?? `#${r.blockId}`,
    subBlokCode: r.subBlokId != null ? (subs.get(r.subBlokId)?.code ?? `#${r.subBlokId}`) : null,
    workerName: emps.get(r.workerEmployeeId)?.name ?? `#${r.workerEmployeeId}`,
    productName: prods.get(r.productId)?.name ?? `#${r.productId}`,
  }));
}
