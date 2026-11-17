import { saveAttendance } from '@/db/repositories/attendance';
import {
  canCorrectFertilization,
  createFertilizationTicket,
  effectiveFertilizationTickets,
  fertilizationEstimate,
  fertilizationViews,
  fertilizers,
  rawatGangs,
  validateFertilization,
  type FertilizationInput,
} from '@/db/repositories/fertilization';
import { applyMasterChanges } from '@/db/repositories/master';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster, txCommon } from '@/test/fixtures';

const D = '2026-10-18';
const base: FertilizationInput = {
  workDate: D,
  blockId: 1,
  subBlokId: 11,
  gangId: 3,
  workerEmployeeId: 30,
  productId: 50,
  method: 'manual',
  applicationRound: 1,
  treeCount: 100,
  qtyKg: 150,
  weather: 'cerah',
  notes: null,
};

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  const page = masterResponseSchema.parse({
    cursor: 'v2',
    server_time: '2026-10-18T00:00:00.000Z',
    changes: {
      block: {
        upserts: [{ id: 1, code: 'A01', afdeling_id: 1, ha: 30, planting_year: 2010, status: 'TM', bjr_kg: 18.5, polygon_geojson: null, tree_count: 2050 }],
      },
      sub_blok: { upserts: [{ id: 11, code: 'A01-1', block_id: 1, terrain_class_id: 2 }, { id: 21, code: 'B01-1', block_id: 2, terrain_class_id: 2 }] },
      gang: { upserts: [{ id: 3, name: 'Rawat 1', foreman_employee_id: 40, afdeling_id: 1, gang_type: 'rawat' }, { id: 1, name: 'Panen 1', foreman_employee_id: 10, afdeling_id: 1, gang_type: 'panen' }] },
      employee: { upserts: [{ id: 30, nik: '1402001', name: 'Eko', type: 'SKU', gang_id: 3, active: true, role: 'pekerja_rawat', employee_type: 'sku_h' }] },
      product: {
        upserts: [
          { id: 50, name: 'Urea', uom: 'kg', is_fertilizer: true, fertilizer_group_id: 7, dosage_kg_per_tree: 1.5 },
          { id: 51, name: 'Dolomit', uom: 'kg', is_fertilizer: true, fertilizer_group_id: null, dosage_kg_per_tree: 2 },
          { id: 52, name: 'Herbisida', uom: 'L', is_fertilizer: false },
        ],
      },
      harvest_rate: {
        upserts: [
          {
            id: 1,
            estate_id: 1,
            employee_type: null,
            date_from: '2026-01-01',
            date_to: null,
            lines: [],
            fertilization_lines: [
              { fertilizer_group_id: 7, method: 'manual', terrain_class_id: null, basis: 'per_kg', amount: 300 },
              { fertilizer_group_id: 7, method: 'manual', terrain_class_id: 2, basis: 'per_kg', amount: 350 },
            ],
          },
        ],
      },
    },
  });
  applyMasterChanges(db, page.changes, page.cursor);
  saveAttendance(db, [attendanceRow({ employeeId: 30, gangId: 3, workDate: D })]);
  return db;
}

const create = (db: ReturnType<typeof setup>, over: Partial<FertilizationInput> = {}) =>
  createFertilizationTicket(db, txCommon(), { ...base, ...over });

describe('tiket pemupukan', () => {
  it('master: hanya kemandoran rawat dan pupuk berkelompok yang bisa dipilih', () => {
    const db = setup();
    expect(rawatGangs(db, [1]).map((g) => g.id)).toEqual([3]);
    expect(fertilizers(db).map((p) => p.id)).toEqual([50]);
  });

  it('validasi mengikuti syarat tiket pemupukan ERP', () => {
    const db = setup();
    expect(validateFertilization(db, base)).toEqual([]);
    expect(validateFertilization(db, { ...base, qtyKg: 150.5 })).toEqual(['over_dose']);
    expect(validateFertilization(db, { ...base, treeCount: 2051, qtyKg: 10 })).toEqual(['tree_count_exceeds_block']);
    expect(validateFertilization(db, { ...base, treeCount: 0 })).toContain('invalid_tree_count');
    expect(validateFertilization(db, { ...base, qtyKg: 0 })).toEqual(['invalid_qty']);
    expect(validateFertilization(db, { ...base, gangId: 1 })).toEqual(['gang_not_rawat']);
    expect(validateFertilization(db, { ...base, subBlokId: null })).toEqual(['sub_blok_required']);
    expect(validateFertilization(db, { ...base, subBlokId: 21 })).toEqual(['sub_blok_mismatch']);
    expect(validateFertilization(db, { ...base, productId: 52 })).toEqual(['unknown_fertilizer']);
    expect(validateFertilization(db, { ...base, productId: 51 })).toEqual(['fertilizer_without_group']);
    expect(validateFertilization(db, { ...base, workerEmployeeId: 10 })).toEqual(['worker_not_present']);
  });

  it('estimasi: batas dosis, status dosis, dan upah dari baris tarif kelas medan sub blok', () => {
    const db = setup();
    const e = fertilizationEstimate(db, { ...base, qtyKg: 125 });
    expect(e).toMatchObject({ treeLimit: 2050, dosageKgPerTree: 1.5, maxQtyKg: 150, dosageStatus: 'under', hasRate: true });
    expect(e.wage).toMatchObject({ quantity: 125, amount: 43750 });
    expect(fertilizationEstimate(db, { ...base, workerEmployeeId: null }).wage.amount).toBe(0);
  });

  it('koreksi menggantikan tiket asal dan hanya boleh sekali', () => {
    const db = setup();
    const a = create(db);
    expect(canCorrectFertilization(db, a)).toBe(true);
    const fix = create(db, { qtyKg: 140, correctionOf: a });
    expect(effectiveFertilizationTickets(db, D).map((x) => x.mobileUuid)).toEqual([fix]);
    expect(canCorrectFertilization(db, a)).toBe(false);
    expect(validateFertilization(db, { ...base, correctionOf: a })).toEqual(['correction_target_invalid']);
    const [view] = fertilizationViews(db, D);
    expect(view).toMatchObject({ blockCode: 'A01', subBlokCode: 'A01-1', workerName: 'Eko', productName: 'Urea', qtyKg: 140 });
  });
});
