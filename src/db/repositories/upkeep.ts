/**
 * Perawatan (upkeep) + pemakaian material.
 *
 * - Pekerja wajib sudah check-in hadir; kegiatan harus jenis upkeep.
 * - per_ha wajib luas realisasi (≤ luas blok), per_tree wajib jumlah pokok.
 * - Material melebihi batas dosis → over_dose = true + catatan wajib (approval asisten).
 * - Upkeep dan setiap material adalah transaksi terpisah; material merujuk upkeep_uuid
 *   dan dikirim sesudahnya (urutan outbox).
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { activity, block, dosageRule, materialUsage, product, upkeep } from '../schema';
import type { AppDatabase } from '../types';
import { doseLimit, isOverDose, type DoseLimit } from '../../features/upkeep/calc';
import { presentEmployeeIds } from './attendance';
import { insertPhoto, linkPhoto, type NewPhoto } from './photos';

export type UpkeepRow = typeof upkeep.$inferSelect;
export type NewUpkeep = typeof upkeep.$inferInsert;
export type NewMaterialUsage = typeof materialUsage.$inferInsert;

export interface UpkeepInput {
  workDate: string;
  activityId: number;
  blockId: number;
  employeeIds: number[];
  hk: number;
  realizedHa: number | null;
  realizedTrees: number | null;
}

export interface MaterialInput {
  productId: number;
  qty: number;
  approvalNote: string | null;
}

export type UpkeepErrorCode =
  | 'no_employees'
  | 'not_checked_in'
  | 'not_upkeep_activity'
  | 'unknown_block'
  | 'invalid_hk'
  | 'ha_required'
  | 'ha_exceeds_block'
  | 'trees_required'
  | 'unknown_product'
  | 'invalid_qty'
  | 'over_dose_note_required';

export interface UpkeepIssue {
  code: UpkeepErrorCode;
  employeeIds?: number[];
  productId?: number;
}

/** Batas dosis per produk untuk kegiatan + luas realisasi. */
export function doseLimitsFor(db: AppDatabase, activityId: number, realizedHa: number | null): Map<number, DoseLimit | null> {
  const rules = db.select().from(dosageRule).where(eq(dosageRule.activityId, activityId)).all();
  return new Map(rules.map((r) => [r.productId, doseLimit(r, realizedHa)]));
}

export function validateUpkeep(db: AppDatabase, input: UpkeepInput, materials: MaterialInput[]): UpkeepIssue[] {
  const issues: UpkeepIssue[] = [];
  if (input.employeeIds.length === 0) issues.push({ code: 'no_employees' });
  const present = presentEmployeeIds(db, input.workDate);
  const missing = input.employeeIds.filter((id) => !present.has(id));
  if (missing.length) issues.push({ code: 'not_checked_in', employeeIds: missing });

  const act = db.select().from(activity).where(eq(activity.id, input.activityId)).get();
  if (!act || act.kind !== 'upkeep') issues.push({ code: 'not_upkeep_activity' });
  const blk = db.select().from(block).where(eq(block.id, input.blockId)).get();
  if (!blk) issues.push({ code: 'unknown_block' });
  if (!(input.hk > 0)) issues.push({ code: 'invalid_hk' });
  if (act?.wageBasis === 'per_ha') {
    if (!(input.realizedHa != null && input.realizedHa > 0)) issues.push({ code: 'ha_required' });
    else if (blk && input.realizedHa > blk.ha) issues.push({ code: 'ha_exceeds_block' });
  }
  if (act?.wageBasis === 'per_tree' && !(input.realizedTrees != null && input.realizedTrees > 0)) issues.push({ code: 'trees_required' });

  const limits = doseLimitsFor(db, input.activityId, input.realizedHa);
  const knownProducts = new Set(
    materials.length ? db.select({ id: product.id }).from(product).where(inArray(product.id, materials.map((m) => m.productId))).all().map((p) => p.id) : [],
  );
  for (const m of materials) {
    if (!knownProducts.has(m.productId)) issues.push({ code: 'unknown_product', productId: m.productId });
    else if (!(m.qty > 0)) issues.push({ code: 'invalid_qty', productId: m.productId });
    else if (isOverDose(m.qty, limits.get(m.productId) ?? null) && !m.approvalNote?.trim()) {
      issues.push({ code: 'over_dose_note_required', productId: m.productId });
    }
  }
  return issues;
}

/**
 * Simpan upkeep + material secara atomik. `commons[i]` = kolom umum transaksi (index 0 untuk
 * upkeep, sisanya untuk material sesuai urutan).
 */
export function createUpkeep(
  db: AppDatabase,
  upkeepCommon: Omit<NewUpkeep, keyof UpkeepInput | 'photoId'>,
  input: UpkeepInput,
  materials: (MaterialInput & { common: Omit<NewMaterialUsage, 'upkeepUuid' | 'productId' | 'qty' | 'uom' | 'overDose' | 'approvalNote'> })[],
  photoRow?: NewPhoto,
): { upkeepUuid: string; overDose: number } {
  const limits = doseLimitsFor(db, input.activityId, input.realizedHa);
  const uoms = new Map(db.select().from(product).all().map((p) => [p.id, p.uom]));
  let overDose = 0;
  db.transaction((tx) => {
    const t = tx as unknown as AppDatabase;
    if (photoRow) insertPhoto(t, photoRow);
    t.insert(upkeep)
      .values({ ...upkeepCommon, ...input, employeeIds: [...new Set(input.employeeIds)], photoId: photoRow?.id ?? null })
      .run();
    for (const m of materials) {
      const over = isOverDose(m.qty, limits.get(m.productId) ?? null);
      if (over) overDose++;
      t.insert(materialUsage)
        .values({
          ...m.common,
          upkeepUuid: upkeepCommon.mobileUuid,
          productId: m.productId,
          qty: m.qty,
          uom: uoms.get(m.productId) ?? '',
          overDose: over,
          approvalNote: over ? (m.approvalNote?.trim() ?? null) : (m.approvalNote?.trim() || null),
        })
        .run();
    }
    if (photoRow) linkPhoto(t, photoRow.id, upkeepCommon.mobileUuid);
  });
  return { upkeepUuid: upkeepCommon.mobileUuid, overDose };
}

export interface UpkeepView extends UpkeepRow {
  activityName: string;
  blockCode: string;
  materials: { productName: string; qty: number; uom: string; overDose: boolean }[];
}

export function upkeepsFor(db: AppDatabase, workDate: string): UpkeepView[] {
  const rows = db
    .select()
    .from(upkeep)
    .where(and(eq(upkeep.workDate, workDate), ne(upkeep.status, 'rejected')))
    .orderBy(desc(upkeep.createdTrustedAt))
    .all();
  if (rows.length === 0) return [];
  const acts = new Map(db.select().from(activity).all().map((a) => [a.id, a.name]));
  const blks = new Map(db.select().from(block).where(inArray(block.id, rows.map((r) => r.blockId))).all().map((b) => [b.id, b.code]));
  const prods = new Map(db.select().from(product).all().map((p) => [p.id, p.name]));
  const mats = db.select().from(materialUsage).where(inArray(materialUsage.upkeepUuid, rows.map((r) => r.mobileUuid))).all();
  return rows.map((r) => ({
    ...r,
    activityName: acts.get(r.activityId) ?? `#${r.activityId}`,
    blockCode: blks.get(r.blockId) ?? `#${r.blockId}`,
    materials: mats
      .filter((m) => m.upkeepUuid === r.mobileUuid)
      .map((m) => ({ productName: prods.get(m.productId) ?? `#${m.productId}`, qty: m.qty, uom: m.uom, overDose: m.overDose })),
  }));
}
