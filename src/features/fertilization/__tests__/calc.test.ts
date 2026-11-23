import type { FertilizationRateLine } from '@/db/schema/master';

import { dosageStatus, fertilizationWage, findFertilizationLine, maxQtyKg } from '../calc';

describe('kalkulasi pemupukan', () => {
  it('batas pupuk = dosis standar × pokok; status dosis pada presisi 2 desimal seperti ERP', () => {
    expect(maxQtyKg(1.5, 100)).toBe(150);
    expect(maxQtyKg(null, 100)).toBeNull();
    expect(dosageStatus(150, 150)).toBe('ok');
    expect(dosageStatus(150.004, 150)).toBe('ok');
    expect(dosageStatus(149.5, 150)).toBe('under');
    expect(dosageStatus(150.5, 150)).toBe('over');
    expect(dosageStatus(999, null)).toBe('none');
  });

  it('baris tarif paling spesifik: kelompok pupuk → metode → kelas medan; kosong = semua', () => {
    const lines: FertilizationRateLine[] = [
      { fertilizer_group_id: null, method: null, terrain_class_id: null, basis: 'per_tree', amount: 100 },
      { fertilizer_group_id: 7, method: null, terrain_class_id: null, basis: 'per_kg', amount: 300 },
      { fertilizer_group_id: 7, method: 'manual', terrain_class_id: null, basis: 'per_kg', amount: 350 },
      { fertilizer_group_id: 7, method: 'manual', terrain_class_id: 2, basis: 'per_kg', amount: 400 },
      { fertilizer_group_id: null, method: 'drone', terrain_class_id: 2, basis: 'per_tree', amount: 90 },
    ];
    const find = (fertilizerGroupId: number | null, method: 'manual' | 'mekanis' | 'drone', terrainClassId: number | null) =>
      findFertilizationLine(lines, { fertilizerGroupId, method, terrainClassId })?.amount;
    expect(find(7, 'manual', 2)).toBe(400);
    expect(find(7, 'manual', 3)).toBe(350);
    expect(find(7, 'mekanis', 2)).toBe(300);
    // Kelompok pupuk lebih menentukan daripada metode + kelas medan.
    expect(find(7, 'drone', 2)).toBe(300);
    expect(find(8, 'drone', 2)).toBe(90);
    expect(find(8, 'manual', null)).toBe(100);
    expect(findFertilizationLine([], { fertilizerGroupId: 7, method: 'manual', terrainClassId: null })).toBeNull();
  });

  it('upah per kg memakai kg pupuk, per pokok memakai pokok dipupuk', () => {
    const perKg: FertilizationRateLine = { basis: 'per_kg', amount: 300 };
    const perTree: FertilizationRateLine = { basis: 'per_tree', amount: 120 };
    expect(fertilizationWage(perKg, { treeCount: 100, qtyKg: 125 })).toEqual({ line: perKg, quantity: 125, amount: 37500 });
    expect(fertilizationWage(perTree, { treeCount: 100, qtyKg: 125 })).toEqual({ line: perTree, quantity: 100, amount: 12000 });
    expect(fertilizationWage(null, { treeCount: 100, qtyKg: 125 }).amount).toBe(0);
  });
});
