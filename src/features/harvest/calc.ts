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

export interface TphTicket extends BunchCounts {
  tphId: number;
  tphCode: string;
  blockCode: string;
  harvesterEmployeeId: number;
  estKg: number;
  transported: boolean;
}

export interface TphTotal {
  tphId: number;
  tphCode: string;
  blockCode: string;
  tickets: number;
  harvesters: number;
  ripe: number;
  unripe: number;
  rotten: number;
  bunches: number;
  looseFruitKg: number;
  estKg: number;
  /** Janjang di tiket yang belum masuk SPB (potensi restan di TPH). */
  bunchesNotTransported: number;
}

/** Rekap tiket efektif per TPH, urut blok lalu kode TPH. */
export function totalsByTph(tickets: readonly TphTicket[]): TphTotal[] {
  const map = new Map<number, TphTotal & { harvesterIds: Set<number> }>();
  for (const x of tickets) {
    let r = map.get(x.tphId);
    if (!r) {
      r = { tphId: x.tphId, tphCode: x.tphCode, blockCode: x.blockCode, tickets: 0, harvesters: 0, ripe: 0, unripe: 0, rotten: 0, bunches: 0, looseFruitKg: 0, estKg: 0, bunchesNotTransported: 0, harvesterIds: new Set() };
      map.set(x.tphId, r);
    }
    const b = totalBunches(x);
    r.tickets += 1;
    r.harvesterIds.add(x.harvesterEmployeeId);
    r.ripe += x.ripe;
    r.unripe += x.unripe;
    r.rotten += x.rotten;
    r.bunches += b;
    r.looseFruitKg = round2(r.looseFruitKg + x.looseFruitKg);
    r.estKg = round2(r.estKg + x.estKg);
    if (!x.transported) r.bunchesNotTransported += b;
  }
  return [...map.values()]
    .map(({ harvesterIds, ...r }) => ({ ...r, harvesters: harvesterIds.size }))
    .sort((a, b) => a.blockCode.localeCompare(b.blockCode) || a.tphCode.localeCompare(b.tphCode, undefined, { numeric: true }));
}
