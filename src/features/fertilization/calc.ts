/**
 * Kalkulasi tiket pemupukan (murni), cermin tiket pemupukan ERP:
 * - Batas pupuk = dosis standar pupuk (kg/pokok) × pokok dipupuk. Di atas batas, ERP tidak bisa
 *   memverifikasi tiket, jadi HP menolak menyimpannya.
 * - Upah = tarif pemupukan paling spesifik (kelompok pupuk → metode → kelas medan; kolom tarif kosong
 *   berlaku untuk semua) × pokok dipupuk atau kg pupuk, sesuai basis tarif.
 */
import type { FertilizationRateLine } from '../../db/schema/master';

export type FertilizationMethod = 'manual' | 'mekanis' | 'drone';
export type DosageStatus = 'none' | 'under' | 'ok' | 'over';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Batas pupuk (kg) tiket; null bila pupuk tanpa dosis standar. */
export function maxQtyKg(dosageKgPerTree: number | null, treeCount: number): number | null {
  return dosageKgPerTree ? round2(dosageKgPerTree * treeCount) : null;
}

/** Sama dengan status dosis ERP: dibandingkan pada presisi 2 desimal. */
export function dosageStatus(qtyKg: number, max: number | null): DosageStatus {
  if (max == null) return 'none';
  const diff = round2(qtyKg) - round2(max);
  if (Math.abs(diff) < 0.005) return 'ok';
  return diff < 0 ? 'under' : 'over';
}

export function findFertilizationLine(
  lines: readonly FertilizationRateLine[],
  ctx: { fertilizerGroupId: number | null; method: FertilizationMethod; terrainClassId: number | null },
): FertilizationRateLine | null {
  const matches = lines.filter(
    (l) =>
      (l.fertilizer_group_id == null || l.fertilizer_group_id === ctx.fertilizerGroupId) &&
      (l.method == null || l.method === ctx.method) &&
      (l.terrain_class_id == null || l.terrain_class_id === ctx.terrainClassId),
  );
  // Urutan stabil: di antara baris yang sama spesifiknya, baris pertama yang menang (seperti ERP).
  const score = (l: FertilizationRateLine) =>
    (l.fertilizer_group_id != null ? 4 : 0) + (l.method != null ? 2 : 0) + (l.terrain_class_id != null ? 1 : 0);
  return [...matches].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export interface FertilizationWage {
  line: FertilizationRateLine | null;
  /** Pokok atau kg sesuai basis tarif. */
  quantity: number;
  amount: number;
}

export function fertilizationWage(
  line: FertilizationRateLine | null,
  work: { treeCount: number; qtyKg: number },
): FertilizationWage {
  if (!line) return { line: null, quantity: 0, amount: 0 };
  const quantity = line.basis === 'per_kg' ? work.qtyKg : work.treeCount;
  return { line, quantity, amount: quantity * line.amount };
}
