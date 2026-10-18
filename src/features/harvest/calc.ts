/**
 * Kalkulasi panen (murni, diuji unit):
 * - est_kg = (matang + mentah + busuk) × BJR blok
 * - estimasi premi dari activity.rate sesuai wage_basis, dikurangi denda (penalty_rule)
 */
export interface BunchCounts {
  ripe: number;
  unripe: number;
  rotten: number;
  emptyBunch: number;
  longStalk: number;
  looseFruitKg: number;
}

export const EMPTY_COUNTS: BunchCounts = { ripe: 0, unripe: 0, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 0 };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totalBunches(c: Pick<BunchCounts, 'ripe' | 'unripe' | 'rotten'>): number {
  return c.ripe + c.unripe + c.rotten;
}

export function estKg(c: Pick<BunchCounts, 'ripe' | 'unripe' | 'rotten'>, bjrKg: number): number {
  return round2(totalBunches(c) * bjrKg);
}

/** Kode penalty_rule yang dipakai untuk komponen hitungan tiket. */
export const PENALTY_CODES = {
  unripe: 'MENTAH',
  longStalk: 'TGKPJG',
} as const;

export type WageBasis = 'daily' | 'per_ha' | 'per_tree' | 'per_bunch';

export interface PremiLine {
  code: string;
  count: number;
  amount: number;
}

export interface PremiEstimate {
  basis: WageBasis | null;
  gross: number;
  penalty: number;
  net: number;
  penalties: PremiLine[];
}

/**
 * Estimasi premi pemanen untuk satu tiket.
 * - per_bunch: rate × janjang matang (mentah/busuk tidak dibayar)
 * - daily: rate (upah harian, tidak bergantung jumlah)
 * - per_ha / per_tree: tidak berlaku untuk tiket panen → 0
 */
export function premiEstimate(
  c: BunchCounts,
  activity: { wageBasis: WageBasis; rate: number } | null,
  penaltyAmounts: ReadonlyMap<string, number>,
): PremiEstimate {
  let gross = 0;
  if (activity?.wageBasis === 'per_bunch') gross = activity.rate * c.ripe;
  else if (activity?.wageBasis === 'daily') gross = activity.rate;

  const penalties: PremiLine[] = [];
  const add = (code: string, count: number) => {
    const unit = penaltyAmounts.get(code);
    if (unit != null && count > 0) penalties.push({ code, count, amount: unit * count });
  };
  add(PENALTY_CODES.unripe, c.unripe);
  add(PENALTY_CODES.longStalk, c.longStalk);
  const penalty = penalties.reduce((s, p) => s + p.amount, 0);
  return { basis: activity?.wageBasis ?? null, gross: round2(gross), penalty: round2(penalty), net: round2(gross - penalty), penalties };
}

export function formatRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}
