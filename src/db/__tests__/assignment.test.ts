import { assignmentsFor, saveAssignment, validateAssignment, workPlansFor } from '@/db/repositories/assignment';
import { saveAttendance } from '@/db/repositories/attendance';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster, txCommon } from '@/test/fixtures';

const D = '2026-10-18';
const base = { workDate: D, workPlanId: 1, unplannedReason: null, activityId: 1, blockId: 1, employeeIds: [10] };

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  saveAttendance(db, [
    attendanceRow({ employeeId: 10, gangId: 1, workDate: D }),
    attendanceRow({ employeeId: 11, gangId: 1, workDate: D, attStatus: 'sakit' }),
  ]);
  return db;
}

describe('penugasan', () => {
  it('rencana kerja per tanggal dan gang', () => {
    const db = setup();
    expect(workPlansFor(db, D, 1).map((p) => p.id)).toEqual([1]);
    expect(workPlansFor(db, D, 2)).toEqual([]);
  });

  it('valid bila semua pekerja hadir dan rencana cocok', () => {
    expect(validateAssignment(setup(), base)).toEqual([]);
  });

  it('pekerja tanpa check-in hadir tidak bisa ditugaskan', () => {
    expect(validateAssignment(setup(), { ...base, employeeIds: [10, 11, 20] })).toEqual([{ code: 'not_checked_in', employeeIds: [11, 20] }]);
  });

  it('di luar rencana wajib alasan; referensi master dicek', () => {
    const db = setup();
    expect(validateAssignment(db, { ...base, workPlanId: null })).toEqual([{ code: 'unplanned_reason_required' }]);
    expect(validateAssignment(db, { ...base, workPlanId: null, unplannedReason: 'hujan kemarin' })).toEqual([]);
    expect(validateAssignment(db, { ...base, activityId: 9, blockId: 9, employeeIds: [] }).map((i) => i.code)).toEqual([
      'no_employees',
      'unknown_activity',
      'unknown_block',
    ]);
    expect(validateAssignment(db, { ...base, workDate: '2026-10-19' }).map((i) => i.code)).toEqual(['not_checked_in', 'work_plan_other_date']);
  });

  it('daftar penugasan hari ini tanpa yang ditolak', () => {
    const db = setup();
    const row = (status: 'queued' | 'rejected') => ({ ...txCommon(), status, workDate: D, workPlanId: 1, activityId: 1, blockId: 1, employeeIds: [10] });
    saveAssignment(db, row('queued'));
    saveAssignment(db, row('rejected'));
    expect(assignmentsFor(db, D)).toHaveLength(1);
  });
});
