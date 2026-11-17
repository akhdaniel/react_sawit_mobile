import type { MaintenanceRateLine } from '@/db/schema/master';

import { findMaintenanceLine, maintenanceWage, materialDosage, workQty, workUnit } from '../calc';

describe('kalkulasi perawatan', () => {
  it('hasil kerja mengikuti satuan jenis perawatan ERP', () => {
    const w = { areaHa: 1.5, treeCount: 80, hk: 0.5 };
    expect([workUnit('semprot_gulma'), workQty('semprot_gulma', w)]).toEqual(['ha', 1.5]);
    expect([workUnit('pruning'), workQty('pruning', w)]).toEqual(['tree', 80]);
    expect([workUnit('perawatan_parit'), workQty('perawatan_parit', w)]).toEqual(['hk', 0.5]);
  });

  it('baris tarif: kelas medan sub blok didahulukan, lalu baris tanpa kelas medan', () => {
    const lines: MaintenanceRateLine[] = [
      { work_type: 'semprot_gulma', terrain_class_id: null, amount: 500 },
      { work_type: 'semprot_gulma', terrain_class_id: 2, amount: 600 },
      { work_type: 'pruning', terrain_class_id: null, amount: 700 },
    ];
    expect(findMaintenanceLine(lines, 'semprot_gulma', 2)?.amount).toBe(600);
    expect(findMaintenanceLine(lines, 'semprot_gulma', 3)?.amount).toBe(500);
    expect(findMaintenanceLine(lines, 'kastrasi', 2)).toBeNull();
    expect(maintenanceWage(lines[1]!, 1.5)).toBe(900);
    expect(maintenanceWage(null, 1.5)).toBe(0);
  });

  it('batas material = dosis per Ha × luas, dibandingkan 3 desimal', () => {
    expect(materialDosage(2, 3, 1.5)).toEqual({ max: 3, status: 'ok' });
    expect(materialDosage(2, 2.5, 1.5)).toEqual({ max: 3, status: 'under' });
    expect(materialDosage(2, 3.001, 1.5)).toEqual({ max: 3, status: 'over' });
    expect(materialDosage(null, 99, 1.5)).toEqual({ max: null, status: 'none' });
  });
});
