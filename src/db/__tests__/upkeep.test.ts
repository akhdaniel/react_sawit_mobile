import { saveAttendance } from '@/db/repositories/attendance';
import { applyMasterChanges } from '@/db/repositories/master';
import { collectOutbox } from '@/db/repositories/outbox';
import { createUpkeep, upkeepsFor, validateUpkeep, type UpkeepInput } from '@/db/repositories/upkeep';
import { materialUsage } from '@/db/schema';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster, txCommon } from '@/test/fixtures';

const D = '2026-10-18';

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  const page = masterResponseSchema.parse({
    cursor: 'v2',
    server_time: '2026-10-18T00:00:00Z',
    changes: {
      activity: {
        upserts: [
          { id: 2, code: 'RW01', name: 'Semprot', kind: 'upkeep', wage_basis: 'per_ha', rate: 75000 },
          { id: 4, code: 'RW03', name: 'Tunas', kind: 'upkeep', wage_basis: 'per_tree', rate: 1500 },
        ],
      },
      product: { upserts: [{ id: 1, name: 'Glifosat', uom: 'L' }, { id: 3, name: 'Urea', uom: 'kg' }] },
      dosage_rule: { upserts: [{ id: 1, activity_id: 2, product_id: 1, dose_per_ha: 1.5, tolerance_pct: 10 }] },
    },
  });
  applyMasterChanges(db, page.changes, page.cursor);
  saveAttendance(db, [attendanceRow({ employeeId: 10, gangId: 1, workDate: D }), attendanceRow({ employeeId: 11, gangId: 1, workDate: D })]);
  return db;
}

const base: UpkeepInput = { workDate: D, activityId: 2, blockId: 1, employeeIds: [10, 11], hk: 2, realizedHa: 2, realizedTrees: null };

describe('perawatan', () => {
  it('validasi kegiatan, pekerja hadir, HK, luas', () => {
    const db = setup();
    expect(validateUpkeep(db, base, [])).toEqual([]);
    expect(validateUpkeep(db, { ...base, activityId: 1 }, []).map((i) => i.code)).toEqual(['not_upkeep_activity']);
    expect(validateUpkeep(db, { ...base, employeeIds: [10, 20] }, [])).toEqual([{ code: 'not_checked_in', employeeIds: [20] }]);
    expect(validateUpkeep(db, { ...base, hk: 0, realizedHa: null }, []).map((i) => i.code)).toEqual(['invalid_hk', 'ha_required']);
    expect(validateUpkeep(db, { ...base, realizedHa: 31 }, []).map((i) => i.code)).toEqual(['ha_exceeds_block']);
    expect(validateUpkeep(db, { ...base, activityId: 4, realizedHa: null }, []).map((i) => i.code)).toEqual(['trees_required']);
  });

  it('over-dose wajib catatan; tanpa aturan dosis tidak dibatasi', () => {
    const db = setup();
    expect(validateUpkeep(db, base, [{ productId: 1, qty: 4, approvalNote: null }])).toEqual([{ code: 'over_dose_note_required', productId: 1 }]);
    expect(validateUpkeep(db, base, [{ productId: 1, qty: 4, approvalNote: 'gulma lebat' }])).toEqual([]);
    expect(validateUpkeep(db, base, [{ productId: 3, qty: 999, approvalNote: null }])).toEqual([]);
    expect(validateUpkeep(db, base, [{ productId: 1, qty: 0, approvalNote: null }, { productId: 9, qty: 1, approvalNote: null }]).map((i) => i.code)).toEqual([
      'invalid_qty',
      'unknown_product',
    ]);
  });

  it('simpan upkeep + material terpisah; over_dose dihitung ulang; urutan kirim upkeep → material', () => {
    const db = setup();
    const up = { ...txCommon(), status: 'queued' as const };
    const r = createUpkeep(db, up, base, [
      { productId: 1, qty: 3, approvalNote: null, common: { ...txCommon(), status: 'queued' } },
      { productId: 1, qty: 4, approvalNote: ' gulma lebat ', common: { ...txCommon(), status: 'queued' } },
    ]);
    expect(r).toEqual({ upkeepUuid: up.mobileUuid, overDose: 1 });
    const mats = db.select().from(materialUsage).all();
    expect(mats.map((m) => [m.qty, m.overDose, m.uom, m.approvalNote])).toEqual([
      [3, false, 'L', null],
      [4, true, 'L', 'gulma lebat'],
    ]);
    expect(upkeepsFor(db, D)[0]).toMatchObject({ activityName: 'Semprot', blockCode: 'A01', materials: [{ productName: 'Glifosat' }, { overDose: true }] });
    expect(collectOutbox(db, 10, '1').entries.map((e) => e.type)).toEqual(['attendance', 'attendance', 'upkeep', 'material_usage', 'material_usage']);
  });
});
