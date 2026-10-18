import {
  attendanceByEmployee,
  defaultCheckInStatus,
  presentEmployeeIds,
  saveAttendance,
  validateCheckIns,
  validateCheckOuts,
  validateCorrection,
} from '@/db/repositories/attendance';
import { attendance, photo } from '@/db/schema';
import { createTestDb } from '@/test/db';
import { attendanceRow, photoRow, seedMaster } from '@/test/fixtures';

const D = '2026-10-18';

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  return db;
}

describe('absensi', () => {
  it('validasi check-in: nonaktif, tidak dikenal, alasan terlambat', () => {
    const db = setup();
    expect(
      validateCheckIns(db, D, 1, [
        { employeeId: 10, attStatus: 'hadir' },
        { employeeId: 12, attStatus: 'hadir' },
        { employeeId: 99, attStatus: 'hadir' },
        { employeeId: 11, attStatus: 'terlambat', lateReason: ' ' },
      ]),
    ).toEqual([
      { employeeId: 12, code: 'employee_inactive' },
      { employeeId: 99, code: 'unknown_employee' },
      { employeeId: 11, code: 'late_reason_required' },
    ]);
  });

  it('satu pekerja hanya check-in di satu gang per hari', () => {
    const db = setup();
    saveAttendance(db, [attendanceRow({ employeeId: 20, gangId: 2, workDate: D })]);
    expect(validateCheckIns(db, D, 1, [{ employeeId: 20, attStatus: 'hadir' }])).toEqual([
      { employeeId: 20, code: 'checked_in_other_gang', otherGang: 'Panen 2' },
    ]);
    expect(validateCheckIns(db, D, 2, [{ employeeId: 20, attStatus: 'hadir' }])).toEqual([{ employeeId: 20, code: 'already_checked_in' }]);
    // hari lain bebas
    expect(validateCheckIns(db, '2026-10-19', 1, [{ employeeId: 20, attStatus: 'hadir' }])).toEqual([]);
  });

  it('check-in yang ditolak server tidak dihitung', () => {
    const db = setup();
    saveAttendance(db, [attendanceRow({ employeeId: 10, gangId: 1, workDate: D, status: 'rejected' })]);
    expect(validateCheckIns(db, D, 1, [{ employeeId: 10, attStatus: 'hadir' }])).toEqual([]);
  });

  it('sakit/izin/mangkir tidak dihitung hadir', () => {
    const db = setup();
    saveAttendance(db, [
      attendanceRow({ employeeId: 10, gangId: 1, workDate: D, attStatus: 'hadir' }),
      attendanceRow({ employeeId: 11, gangId: 1, workDate: D, attStatus: 'sakit' }),
    ]);
    expect([...presentEmployeeIds(db, D)]).toEqual([10]);
  });

  it('check-out butuh check-in hadir di gang yang sama, sekali saja', () => {
    const db = setup();
    saveAttendance(db, [
      attendanceRow({ employeeId: 10, gangId: 1, workDate: D }),
      attendanceRow({ employeeId: 11, gangId: 1, workDate: D, attStatus: 'izin' }),
    ]);
    expect(validateCheckOuts(db, D, 1, [10, 11, 20])).toEqual([
      { employeeId: 11, code: 'not_checked_in' },
      { employeeId: 20, code: 'not_checked_in' },
    ]);
    expect(validateCheckOuts(db, D, 2, [10])).toEqual([{ employeeId: 10, code: 'not_checked_in' }]);
    saveAttendance(db, [attendanceRow({ employeeId: 10, gangId: 1, workDate: D, type: 'check_out' })]);
    expect(validateCheckOuts(db, D, 1, [10])).toEqual([{ employeeId: 10, code: 'already_checked_out' }]);
  });

  it('koreksi menggantikan baris asal tanpa mengubahnya', () => {
    const db = setup();
    const original = attendanceRow({ employeeId: 11, gangId: 1, workDate: D, attStatus: 'sakit', createdTrustedAt: '2026-10-18T00:00:00.000Z' });
    saveAttendance(db, [original]);
    const stored = attendanceByEmployee(db, D).get(11)!.checkIn!;
    expect(validateCorrection(db, stored, 'terlambat', null)).toBe('late_reason_required');
    expect(validateCorrection(db, stored, 'hadir', null)).toBeNull();
    saveAttendance(db, [attendanceRow({ employeeId: 11, gangId: 1, workDate: D, attStatus: 'hadir', correctionOf: original.mobileUuid })]);
    expect(attendanceByEmployee(db, D).get(11)!.checkIn!.attStatus).toBe('hadir');
    expect(presentEmployeeIds(db, D).has(11)).toBe(true);
    // baris asal tidak lagi efektif → koreksi kedua atas baris asal ditolak
    expect(validateCorrection(db, stored, 'izin', null)).toBe('not_checked_in');
    expect(db.select().from(attendance).all()).toHaveLength(2);
  });

  it('foto grup: semua baris merujuk photo_id yang sama, foto tertaut ke baris pertama', () => {
    const db = setup();
    const p = photoRow();
    const rows = [attendanceRow({ employeeId: 10, gangId: 1, workDate: D }), attendanceRow({ employeeId: 11, gangId: 1, workDate: D })];
    saveAttendance(db, rows, p);
    expect(db.select().from(attendance).all().map((r) => r.photoId)).toEqual([p.id, p.id]);
    expect(db.select().from(photo).get()?.transactionUuid).toBe(rows[0]!.mobileUuid);
  });

  it('status default: terlambat bila lewat jam masuk (WIB)', () => {
    const at = (hhmm: string) => Date.parse(`2026-10-18T${hhmm}:00+07:00`);
    expect(defaultCheckInStatus(at('06:30'), 420, '06:30')).toBe('hadir');
    expect(defaultCheckInStatus(at('06:31'), 420, '06:30')).toBe('terlambat');
    expect(defaultCheckInStatus(at('05:50'), 420, '06:30')).toBe('hadir');
  });
});
