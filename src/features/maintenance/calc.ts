/**
 * Kalkulasi tiket perawatan (murni), cermin tiket perawatan ERP:
 * - Hasil kerja = luas (Ha), pokok, atau HK sesuai satuan jenis perawatan.
 * - Upah = tarif perawatan jenis tsb (baris kelas medan sub blok didahulukan) × hasil kerja.
 * - Batas material = dosis standar per Ha × luas tiket. Di atas batas, ERP tidak bisa memverifikasi
 *   tiket, jadi HP menolak menyimpannya. Material berdosis butuh luas (Ha).
 */
import type { MaintenanceRateLine } from '../../db/schema/master';
import { WORK_TYPE_UNITS, type MaintenanceWorkType } from '../../sync/contract/master';

import type { DosageStatus } from '../fertilization/calc';

export interface MaintenanceWork {
  areaHa: number;
  treeCount: number;
  hk: number;
}

export function workUnit(workType: MaintenanceWorkType): 'ha' | 'tree' | 'hk' {
  return WORK_TYPE_UNITS[workType];
}

export function workQty(workType: MaintenanceWorkType, w: MaintenanceWork): number {
  return { ha: w.areaHa, tree: w.treeCount, hk: w.hk }[workUnit(workType)];
}

export function findMaintenanceLine(
  lines: readonly MaintenanceRateLine[],
  workType: MaintenanceWorkType,
  terrainClassId: number | null,
): MaintenanceRateLine | null {
  const matches = lines.filter((l) => l.work_type === workType);
  if (terrainClassId != null) {
    const exact = matches.find((l) => l.terrain_class_id === terrainClassId);
    if (exact) return exact;
  }
  return matches.find((l) => l.terrain_class_id == null) ?? null;
}

export function maintenanceWage(line: MaintenanceRateLine | null, qty: number): number {
  return line ? qty * line.amount : 0;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Batas dan status dosis satu material; dibandingkan pada presisi 3 desimal seperti ERP. */
export function materialDosage(dosagePerHa: number | null, qty: number, areaHa: number): { max: number | null; status: DosageStatus } {
  if (!dosagePerHa) return { max: null, status: 'none' };
  const max = round3(dosagePerHa * areaHa);
  const diff = round3(qty) - max;
  return { max, status: Math.abs(diff) < 0.0005 ? 'ok' : diff < 0 ? 'under' : 'over' };
}
