import { doseLimit, isOverDose, upkeepWageEstimate } from '@/features/upkeep/calc';

describe('kalkulasi perawatan', () => {
  it('batas dosis = dosis/ha × luas × (1 + toleransi)', () => {
    expect(doseLimit({ dosePerHa: 1.5, tolerancePct: 10 }, 2)).toEqual({ standard: 3, max: 3.3 });
    expect(doseLimit({ dosePerHa: 150, tolerancePct: 5 }, 12.5)).toEqual({ standard: 1875, max: 1968.75 });
    expect(doseLimit(null, 2)).toBeNull();
    expect(doseLimit({ dosePerHa: 1, tolerancePct: 0 }, null)).toBeNull();
    expect(doseLimit({ dosePerHa: 1, tolerancePct: 0 }, 0)).toBeNull();
  });

  it('over-dose hanya bila melebihi batas maksimum', () => {
    const lim = { standard: 3, max: 3.3 };
    expect(isOverDose(3.3, lim)).toBe(false);
    expect(isOverDose(3.31, lim)).toBe(true);
    expect(isOverDose(100, null)).toBe(false);
  });

  it('estimasi upah per wage_basis', () => {
    const w = { hk: 3, realizedHa: 2.5, realizedTrees: 400 };
    expect(upkeepWageEstimate({ wageBasis: 'per_ha', rate: 75000 }, w)).toBe(187500);
    expect(upkeepWageEstimate({ wageBasis: 'per_tree', rate: 1500 }, w)).toBe(600000);
    expect(upkeepWageEstimate({ wageBasis: 'daily', rate: 120000 }, w)).toBe(360000);
    expect(upkeepWageEstimate({ wageBasis: 'per_bunch', rate: 2500 }, w)).toBe(0);
    expect(upkeepWageEstimate(null, w)).toBe(0);
  });
});
