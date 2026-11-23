/**
 * Kalkulasi panen (murni, diuji unit):
 * - est_kg = (matang + mentah + busuk) × BJR blok
 * - estimasi premi dari tarif panen ERP (harvest_rate), rumus sama dengan tiket panen ERP:
 *   baris tarif per mutu × kelas medan sub blok; basis per kg = janjang × BJR; brondolan dalam kg.
 */
import type { HarvestRateLine } from '../../db/schema/master';

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

export interface HarvestRate {
  id: number;
  estateId: number | null;
  employeeType: string | null;
  dateFrom: string;
  dateTo: string | null;
  lines: HarvestRateLine[];
}

/**
 * Tarif aktif paling spesifik pada tanggal tsb (sama dengan ERP): estate terisi mengalahkan kosong,
 * lalu tipe karyawan terisi mengalahkan kosong, lalu tanggal mulai terbaru.
 */
export function findRate<R extends HarvestRate>(
  rates: readonly R[],
  ctx: { workDate: string; estateId: number | null; employeeType: string | null },
): R | null {
  const candidates = rates.filter(
    (r) =>
      r.dateFrom <= ctx.workDate &&
      (!r.dateTo || r.dateTo >= ctx.workDate) &&
      (r.estateId == null || r.estateId === ctx.estateId) &&
      (r.employeeType == null || r.employeeType === ctx.employeeType),
  );
  const key = (r: R) => [r.estateId != null ? 1 : 0, r.employeeType != null ? 1 : 0, r.dateFrom] as const;
  candidates.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return kb[0] - ka[0] || kb[1] - ka[1] || kb[2].localeCompare(ka[2]);
  });
  return candidates[0] ?? null;
}

/** Baris tarif untuk satu mutu: baris kelas medan sub blok didahulukan, lalu baris tanpa kelas medan. */
export function findRateLine(
  rate: HarvestRate,
  grade: HarvestRateLine['grade'],
  lineType: HarvestRateLine['line_type'],
  terrainClassId: number | null,
): HarvestRateLine | null {
  const lines = rate.lines.filter((l) => l.grade === grade && l.line_type === lineType && l.scope === 'all');
  if (terrainClassId != null) {
    const exact = lines.find((l) => l.terrain_class_id === terrainClassId);
    if (exact) return exact;
  }
  return lines.find((l) => l.terrain_class_id == null) ?? null;
}

export interface WageLine {
  grade: HarvestRateLine['grade'];
  lineType: HarvestRateLine['line_type'];
  basis: HarvestRateLine['basis'];
  bunches: number;
  bjrKg: number;
  quantity: number;
  unit: 'bunch' | 'kg';
  amount: number;
  /** Premi positif, denda negatif. */
  subtotal: number;
}

export interface PremiEstimate {
  /** false = belum ada tarif panen aktif untuk pemanen/tanggal ini. */
  hasRate: boolean;
  premium: number;
  penalty: number;
  net: number;
  lines: WageLine[];
}

const GRADE_COUNTS: [HarvestRateLine['grade'], keyof BunchCounts | null][] = [
  ['ripe', 'ripe'],
  ['unripe', 'unripe'],
  ['rotten', 'rotten'],
  ['empty_bunch', 'emptyBunch'],
  ['long_stalk', 'longStalk'],
  ['loose_fruit', null],
];

/**
 * Estimasi premi tiket. Premi lebih basis borong (scope 'over_basis') dihitung per hari di ERP,
 * tidak di tiket.
 */
export function premiEstimate(c: BunchCounts, bjrKg: number, rate: HarvestRate | null, terrainClassId: number | null): PremiEstimate {
  const lines: WageLine[] = [];
  let premium = 0;
  let penalty = 0;
  if (rate) {
    for (const [grade, field] of GRADE_COUNTS) {
      for (const lineType of ['premium', 'penalty'] as const) {
        const line = findRateLine(rate, grade, lineType, terrainClassId);
        if (!line) continue;
        const bunches = field ? c[field] : 0;
        const perKg = grade === 'loose_fruit' || line.basis === 'per_kg';
        const quantity = grade === 'loose_fruit' ? c.looseFruitKg : line.basis === 'per_kg' ? bunches * bjrKg : bunches;
        if (!quantity) continue;
        const value = quantity * line.amount;
        if (lineType === 'premium') premium += value;
        else penalty += value;
        lines.push({
          grade,
          lineType,
          basis: line.basis,
          bunches,
          bjrKg: field && line.basis === 'per_kg' ? bjrKg : 0,
          quantity: round2(quantity),
          unit: perKg ? 'kg' : 'bunch',
          amount: line.amount,
          subtotal: round2(lineType === 'premium' ? value : -value),
        });
      }
    }
  }
  return { hasRate: rate != null, premium: round2(premium), penalty: round2(penalty), net: round2(premium - penalty), lines };
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
