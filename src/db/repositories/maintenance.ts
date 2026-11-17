/**
 * Tiket perawatan (struktur tiket perawatan ERP): satu pekerja per tiket, material sebagai baris tiket.
 *
 * - Kemandoran wajib jenis rawat; pekerja wajib sudah check-in hadir hari itu; sub blok wajib.
 * - Hasil kerja (Ha / pokok / HK sesuai jenis perawatan) wajib > 0; luas ≤ luas blok, pokok ≤ pokok blok.
 * - Material tidak boleh dobel dan tidak boleh melebihi dosis standar per Ha × luas (material berdosis
 *   butuh luas), karena ERP tidak bisa memverifikasi tiket seperti itu.
 * - Nomor tiket dibuat ERP saat posting; koreksi = tiket baru dengan correction_of.
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type { DosageStatus } from '../../features/fertilization/calc';
import { findRate } from '../../features/harvest/calc';
import { findMaintenanceLine, maintenanceWage, materialDosage, workQty, workUnit } from '../../features/maintenance/calc';
import type { MaintenanceWorkType } from '../../sync/contract/master';
import { afdeling, block, employee, gang, harvestRate, maintenanceTicket, product, subBlok, type MaintenanceMaterial } from '../schema';
import type { AppDatabase } from '../types';
import { presentEmployeeIds } from './attendance';

export type MaintenanceTicketRow = typeof maintenanceTicket.$inferSelect;
export type NewMaintenanceTicket = typeof maintenanceTicket.$inferInsert;

export type MaintenanceErrorCode =
  | 'unknown_block'
  | 'sub_blok_required'
  | 'sub_blok_mismatch'
  | 'gang_not_rawat'
  | 'worker_not_present'
  | 'invalid_work_qty'
  | 'area_exceeds_block'
  | 'tree_count_exceeds_block'
  | 'unknown_product'
  | 'duplicate_material'
  | 'invalid_qty'
  | 'area_required_for_dosage'
  | 'over_dose'
  | 'correction_target_invalid';

export interface MaintenanceInput {
  workDate: string;
  blockId: number;
  subBlokId: number | null;
  gangId: number;
  workerEmployeeId: number;
  workType: MaintenanceWorkType;
  areaHa: number;
  treeCount: number;
  hk: number;
  weather: MaintenanceTicketRow['weather'];
  notes: string | null;
  materials: MaintenanceMaterial[];
  correctionOf?: string | null;
}

/** Material perawatan yang bisa dipilih: produk master non-pupuk (pupuk lewat tiket pemupukan). */
export function maintenanceMaterials(db: AppDatabase) {
  return db.select().from(product).orderBy(product.name).all().filter((p) => !p.isFertilizer);
}

/** Tiket efektif: tidak ditolak dan tidak digantikan koreksi. */
export function effectiveMaintenanceTickets(db: AppDatabase, workDate?: string): MaintenanceTicketRow[] {
  const conds = [ne(maintenanceTicket.status, 'rejected')];
  if (workDate) conds.push(eq(maintenanceTicket.workDate, workDate));
  const rows = db.select().from(maintenanceTicket).where(and(...conds)).orderBy(desc(maintenanceTicket.createdTrustedAt)).all();
  const superseded = new Set(rows.map((r) => r.correctionOf).filter((x): x is string => !!x));
  return rows.filter((r) => !superseded.has(r.mobileUuid));
}

export interface MaterialCheck {
  productId: number;
  name: string;
  uom: string;
  qty: number;
  dosagePerHa: number | null;
  max: number | null;
  status: DosageStatus;
}

export interface MaintenanceEstimate {
  unit: 'ha' | 'tree' | 'hk';
  workQty: number;
  /** Batas luas/pokok dari blok; null = tidak dibatasi. */
  areaLimit: number | null;
  treeLimit: number | null;
  materials: MaterialCheck[];
  hasRate: boolean;
  rateAmount: number | null;
  wage: number;
}

/** Batas kerja, dosis material, dan estimasi upah dari master lokal, dengan aturan yang sama dengan tiket ERP. */
export function maintenanceEstimate(
  db: AppDatabase,
  input: Pick<MaintenanceInput, 'workDate' | 'workType' | 'areaHa' | 'treeCount' | 'hk' | 'materials'> & {
    blockId: number | null;
    subBlokId: number | null;
    workerEmployeeId: number | null;
  },
): MaintenanceEstimate {
  const b = input.blockId
    ? db
        .select({ ha: block.ha, treeCount: block.treeCount, estateId: afdeling.estateId })
        .from(block)
        .innerJoin(afdeling, eq(afdeling.id, block.afdelingId))
        .where(eq(block.id, input.blockId))
        .get()
    : undefined;
  const ids = input.materials.map((m) => m.product_id);
  const prods = new Map((ids.length ? db.select().from(product).where(inArray(product.id, ids)).all() : []).map((p) => [p.id, p]));
  const materials = input.materials.map((m) => {
    const p = prods.get(m.product_id);
    const dosagePerHa = p?.dosagePerHa ?? null;
    return {
      productId: m.product_id,
      name: p?.name ?? `#${m.product_id}`,
      uom: p?.uom ?? '',
      qty: m.qty,
      dosagePerHa,
      ...materialDosage(dosagePerHa, m.qty, input.areaHa),
    };
  });
  const terrainClassId = input.subBlokId
    ? (db.select({ c: subBlok.terrainClassId }).from(subBlok).where(eq(subBlok.id, input.subBlokId)).get()?.c ?? null)
    : null;
  const employeeType = input.workerEmployeeId
    ? (db.select({ t: employee.employeeType }).from(employee).where(eq(employee.id, input.workerEmployeeId)).get()?.t ?? null)
    : null;
  const rate = input.workerEmployeeId
    ? findRate(db.select().from(harvestRate).all(), { workDate: input.workDate, estateId: b?.estateId ?? null, employeeType })
    : null;
  const line = rate ? findMaintenanceLine(rate.maintenanceLines ?? [], input.workType, terrainClassId) : null;
  const qty = workQty(input.workType, input);
  return {
    unit: workUnit(input.workType),
    workQty: qty,
    areaLimit: b?.ha || null,
    treeLimit: b?.treeCount || null,
    materials,
    hasRate: !!rate,
    rateAmount: line?.amount ?? null,
    wage: maintenanceWage(line, qty),
  };
}

export function validateMaintenance(db: AppDatabase, input: MaintenanceInput): MaintenanceErrorCode[] {
  const issues: MaintenanceErrorCode[] = [];
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

  if (!(workQty(input.workType, input) > 0)) issues.push('invalid_work_qty');
  if (b?.ha && Math.round(input.areaHa * 100) > Math.round(b.ha * 100)) issues.push('area_exceeds_block');
  if (b?.treeCount && input.treeCount > b.treeCount) issues.push('tree_count_exceeds_block');

  const ids = input.materials.map((m) => m.product_id);
  if (new Set(ids).size !== ids.length) issues.push('duplicate_material');
  const prods = new Map((ids.length ? db.select().from(product).where(inArray(product.id, ids)).all() : []).map((p) => [p.id, p]));
  for (const m of input.materials) {
    const p = prods.get(m.product_id);
    if (!p || p.isFertilizer) issues.push('unknown_product');
    else if (!(m.qty > 0)) issues.push('invalid_qty');
    else if (p.dosagePerHa && !(input.areaHa > 0)) issues.push('area_required_for_dosage');
    else if (materialDosage(p.dosagePerHa, m.qty, input.areaHa).status === 'over') issues.push('over_dose');
  }

  if (input.correctionOf && !canCorrectMaintenance(db, input.correctionOf)) issues.push('correction_target_invalid');
  return [...new Set(issues)];
}

/** Tiket boleh dikoreksi bila ada dan belum punya koreksi yang tidak ditolak. */
export function canCorrectMaintenance(db: AppDatabase, mobileUuid: string): boolean {
  const target = db
    .select({ u: maintenanceTicket.mobileUuid })
    .from(maintenanceTicket)
    .where(eq(maintenanceTicket.mobileUuid, mobileUuid))
    .get();
  if (!target) return false;
  const existing = db
    .select({ u: maintenanceTicket.mobileUuid })
    .from(maintenanceTicket)
    .where(and(eq(maintenanceTicket.correctionOf, mobileUuid), ne(maintenanceTicket.status, 'rejected')))
    .get();
  return !existing;
}

export function createMaintenanceTicket(
  db: AppDatabase,
  common: Omit<NewMaintenanceTicket, keyof MaintenanceInput>,
  input: MaintenanceInput,
): string {
  db.insert(maintenanceTicket)
    .values({
      ...common,
      correctionOf: input.correctionOf ?? null,
      workDate: input.workDate,
      blockId: input.blockId,
      subBlokId: input.subBlokId,
      gangId: input.gangId,
      workerEmployeeId: input.workerEmployeeId,
      workType: input.workType,
      areaHa: input.areaHa,
      treeCount: input.treeCount,
      hk: input.hk,
      weather: input.weather,
      notes: input.notes?.trim() || null,
      materials: input.materials,
    })
    .run();
  return common.mobileUuid;
}

export interface MaintenanceView extends MaintenanceTicketRow {
  blockCode: string;
  subBlokCode: string | null;
  workerName: string;
}

export function maintenanceViews(db: AppDatabase, workDate: string): MaintenanceView[] {
  return decorate(db, effectiveMaintenanceTickets(db, workDate));
}

export function maintenanceView(db: AppDatabase, mobileUuid: string): MaintenanceView | null {
  const row = db.select().from(maintenanceTicket).where(eq(maintenanceTicket.mobileUuid, mobileUuid)).get();
  return row ? (decorate(db, [row])[0] ?? null) : null;
}

function decorate(db: AppDatabase, rows: MaintenanceTicketRow[]): MaintenanceView[] {
  if (rows.length === 0) return [];
  const byId = <T extends { id: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const blocks = byId(db.select().from(block).where(inArray(block.id, rows.map((r) => r.blockId))).all());
  const subs = byId(
    db.select().from(subBlok).where(inArray(subBlok.id, rows.map((r) => r.subBlokId).filter((x): x is number => x != null))).all(),
  );
  const emps = byId(db.select().from(employee).where(inArray(employee.id, rows.map((r) => r.workerEmployeeId))).all());
  return rows.map((r) => ({
    ...r,
    blockCode: blocks.get(r.blockId)?.code ?? `#${r.blockId}`,
    subBlokCode: r.subBlokId != null ? (subs.get(r.subBlokId)?.code ?? `#${r.subBlokId}`) : null,
    workerName: emps.get(r.workerEmployeeId)?.name ?? `#${r.workerEmployeeId}`,
  }));
}
