/**
 * Kalkulasi perawatan (murni):
 * - Batas dosis material = dose_per_ha × realized_ha × (1 + tolerance_pct/100)
 *   → melebihi batas = over_dose (wajib catatan, masuk antrean approval asisten).
 * - Estimasi upah sesuai wage_basis kegiatan.
 */
import type { WageBasis } from '../harvest/calc';

export interface DoseRule {
  dosePerHa: number;
  tolerancePct: number;
}

export interface DoseLimit {
  standard: number;
  max: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** null bila dosis tidak bisa dihitung (tanpa aturan atau tanpa luas realisasi). */
export function doseLimit(rule: DoseRule | null, realizedHa: number | null): DoseLimit | null {
  if (!rule || realizedHa == null || realizedHa <= 0) return null;
  const standard = rule.dosePerHa * realizedHa;
  return { standard: round3(standard), max: round3(standard * (1 + rule.tolerancePct / 100)) };
}

export function isOverDose(qty: number, limit: DoseLimit | null): boolean {
  return limit != null && qty > limit.max + 1e-9;
}

export function upkeepWageEstimate(
  activity: { wageBasis: WageBasis; rate: number } | null,
  w: { hk: number; realizedHa: number | null; realizedTrees: number | null },
): number {
  if (!activity) return 0;
  switch (activity.wageBasis) {
    case 'per_ha':
      return Math.round(activity.rate * (w.realizedHa ?? 0));
    case 'per_tree':
      return Math.round(activity.rate * (w.realizedTrees ?? 0));
    case 'daily':
      return Math.round(activity.rate * w.hk);
    case 'per_bunch':
      return 0;
  }
}
