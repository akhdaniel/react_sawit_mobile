import { saveAttendance } from '@/db/repositories/attendance';
import { buildDailySummary } from '@/db/repositories/daily-report';
import {
  canCorrectMaintenance,
  createMaintenanceTicket,
  effectiveMaintenanceTickets,
  maintenanceEstimate,
  maintenanceMaterials,
  maintenanceViews,
  validateMaintenance,
  type MaintenanceInput,
} from '@/db/repositories/maintenance';
import { applyMasterChanges } from '@/db/repositories/master';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster, txCommon } from '@/test/fixtures';

const D = '2026-10-18';
const base: MaintenanceInput = {
  workDate: D,
  blockId: 1,
  subBlokId: 11,
  gangId: 3,
  workerEmployeeId: 30,
  workType: 'semprot_gulma',
  areaHa: 1.5,
  treeCount: 0,
  hk: 1,
  weather: null,
  notes: null,
  materials: [{ product_id: 60, qty: 3 }],
};

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  const page = masterResponseSchema.parse({
    cursor: 'v2',
    server_time: '2026-10-18T00:00:00.000Z',
    changes: {
      block: {
        upserts: [{ id: 1, code: 'A01', afdeling_id: 1, ha: 30, planting_year: 2010, status: 'TM', bjr_kg: 18.5, polygon_geojson: null, tree_count: 2000 }],
      },
      sub_blok: { upserts: [{ id: 11, code: 'A01-1', block_id: 1, terrain_class_id: 2 }] },
      gang: { upserts: [{ id: 3, name: 'Rawat 1', foreman_employee_id: 40, afdeling_id: 1, gang_type: 'rawat' }] },
      employee: { upserts: [{ id: 30, nik: '1402001', name: 'Eko', type: 'SKU', gang_id: 3, active: true, role: 'pekerja_rawat', employee_type: 'sku_h' }] },
      product: {
        upserts: [
          { id: 60, name: 'Glifosat', uom: 'L', is_fertilizer: false, dosage_per_ha: 2 },
          { id: 61, name: 'Perata', uom: 'L', is_fertilizer: false },
          { id: 50, name: 'Urea', uom: 'kg', is_fertilizer: true, fertilizer_group_id: 7, dosage_kg_per_tree: 1.5 },
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
            maintenance_lines: [
              { work_type: 'semprot_gulma', terrain_class_id: null, amount: 500 },
              { work_type: 'semprot_gulma', terrain_class_id: 2, amount: 600 },
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

describe('tiket perawatan', () => {
  it('material: produk non-pupuk saja', () => {
    expect(maintenanceMaterials(setup()).map((p) => p.id)).toEqual([60, 61]);
  });

  it('validasi mengikuti syarat tiket perawatan ERP', () => {
    const db = setup();
    expect(validateMaintenance(db, base)).toEqual([]);
    expect(validateMaintenance(db, { ...base, materials: [{ product_id: 60, qty: 3.01 }] })).toEqual(['over_dose']);
    expect(validateMaintenance(db, { ...base, workType: 'lainnya', areaHa: 0 })).toEqual(['area_required_for_dosage']);
    // Material mengikuti jenis perawatan: wajib untuk kimia/umpan, dilarang untuk pekerjaan manual, opsional untuk Lainnya.
    expect(validateMaintenance(db, { ...base, materials: [] })).toEqual(['material_required']);
    expect(validateMaintenance(db, { ...base, workType: 'pengendalian_tikus', materials: [] })).toEqual(['material_required']);
    expect(validateMaintenance(db, { ...base, workType: 'pruning', areaHa: 0, treeCount: 10, materials: [{ product_id: 61, qty: 1 }] })).toEqual(['material_not_allowed']);
    expect(validateMaintenance(db, { ...base, workType: 'lainnya', materials: [] })).toEqual([]);
    expect(validateMaintenance(db, { ...base, workType: 'pruning', treeCount: 0, materials: [] })).toEqual(['invalid_work_qty']);
    expect(validateMaintenance(db, { ...base, workType: 'lainnya', areaHa: 30.01, materials: [] })).toEqual(['area_exceeds_block']);
    expect(validateMaintenance(db, { ...base, workType: 'lainnya', treeCount: 2001, materials: [] })).toEqual(['tree_count_exceeds_block']);
    expect(validateMaintenance(db, { ...base, materials: [{ product_id: 61, qty: 1 }, { product_id: 61, qty: 1 }] })).toEqual(['duplicate_material']);
    expect(validateMaintenance(db, { ...base, materials: [{ product_id: 50, qty: 1 }] })).toEqual(['unknown_product']);
    expect(validateMaintenance(db, { ...base, materials: [{ product_id: 61, qty: 0 }] })).toEqual(['invalid_qty']);
    expect(validateMaintenance(db, { ...base, gangId: 1 })).toEqual(['gang_not_rawat']);
    expect(validateMaintenance(db, { ...base, workerEmployeeId: 10 })).toEqual(['worker_not_present']);
    expect(validateMaintenance(db, { ...base, workType: 'perawatan_parit', areaHa: 0, hk: 0.5, materials: [] })).toEqual([]);
  });

  it('estimasi: upah tarif kelas medan sub blok × luas, batas dosis per material', () => {
    const e = maintenanceEstimate(setup(), { ...base, materials: [{ product_id: 60, qty: 2.5 }, { product_id: 61, qty: 1 }] });
    expect(e).toMatchObject({ unit: 'ha', workQty: 1.5, areaLimit: 30, treeLimit: 2000, rateAmount: 600, wage: 900 });
    expect(e.materials.map((m) => [m.name, m.max, m.status])).toEqual([
      ['Glifosat', 3, 'under'],
      ['Perata', null, 'none'],
    ]);
  });

  it('koreksi menggantikan tiket asal; laporan harian menghitung tiket perawatan', () => {
    const db = setup();
    const a = createMaintenanceTicket(db, txCommon(), base);
    const fix = createMaintenanceTicket(db, txCommon(), { ...base, areaHa: 1, materials: [{ product_id: 60, qty: 2 }], correctionOf: a });
    expect(effectiveMaintenanceTickets(db, D).map((x) => x.mobileUuid)).toEqual([fix]);
    expect(canCorrectMaintenance(db, a)).toBe(false);
    expect(maintenanceViews(db, D)[0]).toMatchObject({ blockCode: 'A01', subBlokCode: 'A01-1', workerName: 'Eko', areaHa: 1 });
    expect(buildDailySummary(db, D, 3).upkeep).toEqual({ jobs: 1, hk: 1, ha: 1, overDose: 0 });
  });
});
