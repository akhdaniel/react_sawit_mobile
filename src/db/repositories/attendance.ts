/**
 * Absensi: status efektif per pekerja per hari dan aturan bisnis.
 *
 * - Baris efektif = tidak ditolak server dan tidak digantikan koreksi (koreksi adalah baris
 *   baru dengan correction_of = mobile_uuid asal; aturan append-only).
 * - Hadir = check-in efektif dengan att_status hadir/terlambat. Sakit/izin/mangkir dicatat
 *   sebagai check-in berstatus tersebut (tidak dianggap hadir).
 * - Satu pekerja hanya check-in di satu gang per hari; check-out butuh check-in hadir di
 *   gang yang sama.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';

import { attendance, employee, gang } from '../schema';
import type { AppDatabase } from '../types';
import { insertPhoto, linkPhoto, type NewPhoto } from './photos';

export type AttendanceRow = typeof attendance.$inferSelect;
export type AttStatus = AttendanceRow['attStatus'];

export const PRESENT_STATUSES: readonly AttStatus[] = ['hadir', 'terlambat'];

export interface DayAttendance {
  checkIn: AttendanceRow | null;
  checkOut: AttendanceRow | null;
}

/** Baris absensi efektif pada tanggal kerja (opsional dibatasi pekerja tertentu). */
export function effectiveAttendance(db: AppDatabase, workDate: string, employeeIds?: number[]): AttendanceRow[] {
  const conds = [eq(attendance.workDate, workDate), ne(attendance.status, 'rejected')];
  if (employeeIds) conds.push(inArray(attendance.employeeId, employeeIds));
  const rows = db.select().from(attendance).where(and(...conds)).all();
  const superseded = new Set(rows.map((r) => r.correctionOf).filter((x): x is string => !!x));
  return rows.filter((r) => !superseded.has(r.mobileUuid));
}

/** Status absensi hari itu per pekerja (check-in/out terakhir yang efektif). */
export function attendanceByEmployee(db: AppDatabase, workDate: string, employeeIds?: number[]): Map<number, DayAttendance> {
  const map = new Map<number, DayAttendance>();
  const rows = effectiveAttendance(db, workDate, employeeIds).sort((a, b) => a.createdTrustedAt.localeCompare(b.createdTrustedAt));
  for (const r of rows) {
    const d = map.get(r.employeeId) ?? { checkIn: null, checkOut: null };
    if (r.type === 'check_in') d.checkIn = r;
    else d.checkOut = r;
    map.set(r.employeeId, d);
  }
  return map;
}

export function isPresent(d: DayAttendance | undefined): boolean {
  return !!d?.checkIn && PRESENT_STATUSES.includes(d.checkIn.attStatus);
}

export function presentEmployeeIds(db: AppDatabase, workDate: string): Set<number> {
  const out = new Set<number>();
  for (const [id, d] of attendanceByEmployee(db, workDate)) if (isPresent(d)) out.add(id);
  return out;
}

export type AttendanceErrorCode =
  | 'unknown_employee'
  | 'employee_inactive'
  | 'already_checked_in'
  | 'checked_in_other_gang'
  | 'not_checked_in'
  | 'already_checked_out'
  | 'late_reason_required';

export interface AttendanceIssue {
  employeeId: number;
  code: AttendanceErrorCode;
  /** Nama gang lain bila checked_in_other_gang. */
  otherGang?: string;
}

export class AttendanceError extends Error {
  constructor(readonly issues: AttendanceIssue[]) {
    super(issues.map((i) => `${i.employeeId}:${i.code}`).join(', '));
    this.name = 'AttendanceError';
  }
}

export interface CheckInEntry {
  employeeId: number;
  attStatus: AttStatus;
  lateReason?: string | null;
}

export function validateCheckIns(db: AppDatabase, workDate: string, gangId: number, entries: CheckInEntry[]): AttendanceIssue[] {
  const ids = entries.map((e) => e.employeeId);
  const emps = new Map(db.select().from(employee).where(inArray(employee.id, ids)).all().map((e) => [e.id, e]));
  const day = attendanceByEmployee(db, workDate, ids);
  const issues: AttendanceIssue[] = [];
  const seen = new Set<number>();
  for (const e of entries) {
    const emp = emps.get(e.employeeId);
    if (!emp) issues.push({ employeeId: e.employeeId, code: 'unknown_employee' });
    else if (!emp.active) issues.push({ employeeId: e.employeeId, code: 'employee_inactive' });
    else if (seen.has(e.employeeId)) issues.push({ employeeId: e.employeeId, code: 'already_checked_in' });
    else {
      const existing = day.get(e.employeeId)?.checkIn;
      if (existing) {
        if (existing.gangId === gangId) issues.push({ employeeId: e.employeeId, code: 'already_checked_in' });
        else {
          const other = db.select({ name: gang.name }).from(gang).where(eq(gang.id, existing.gangId)).get();
          issues.push({ employeeId: e.employeeId, code: 'checked_in_other_gang', otherGang: other?.name ?? `#${existing.gangId}` });
        }
      } else if (e.attStatus === 'terlambat' && !e.lateReason?.trim()) {
        issues.push({ employeeId: e.employeeId, code: 'late_reason_required' });
      }
    }
    seen.add(e.employeeId);
  }
  return issues;
}

export function validateCheckOuts(db: AppDatabase, workDate: string, gangId: number, employeeIds: number[]): AttendanceIssue[] {
  const day = attendanceByEmployee(db, workDate, employeeIds);
  const issues: AttendanceIssue[] = [];
  for (const id of employeeIds) {
    const d = day.get(id);
    if (!isPresent(d) || d!.checkIn!.gangId !== gangId) issues.push({ employeeId: id, code: 'not_checked_in' });
    else if (d!.checkOut) issues.push({ employeeId: id, code: 'already_checked_out' });
  }
  return issues;
}

/** Field bisnis + umum untuk satu baris absensi, dibuat oleh pemanggil (tx-factory). */
export type NewAttendance = typeof attendance.$inferInsert;

/**
 * Simpan beberapa baris absensi + foto (opsional) secara atomik. Foto grup ditautkan ke
 * baris pertama; semua baris merujuk photo_id yang sama.
 */
export function saveAttendance(db: AppDatabase, rows: NewAttendance[], photoRow?: NewPhoto): void {
  if (rows.length === 0) return;
  db.transaction((tx) => {
    const t = tx as unknown as AppDatabase;
    if (photoRow) insertPhoto(t, photoRow);
    for (const r of rows) t.insert(attendance).values({ ...r, photoId: photoRow?.id ?? r.photoId ?? null }).run();
    if (photoRow) linkPhoto(t, photoRow.id, rows[0]!.mobileUuid);
  });
}

/**
 * Koreksi status check-in (mis. tercatat sakit padahal hadir): baris BARU dengan
 * correction_of = mobile_uuid asal. Baris asal tidak diubah (append-only).
 */
export function validateCorrection(db: AppDatabase, original: AttendanceRow, attStatus: AttStatus, lateReason: string | null): AttendanceErrorCode | null {
  const current = attendanceByEmployee(db, original.workDate, [original.employeeId]).get(original.employeeId);
  if (current?.checkIn?.mobileUuid !== original.mobileUuid) return 'not_checked_in';
  if (attStatus === 'terlambat' && !lateReason?.trim()) return 'late_reason_required';
  if (current.checkOut && !PRESENT_STATUSES.includes(attStatus)) return 'already_checked_out';
  return null;
}

/** Status default saat check-in: terlambat bila lewat jam masuk (zona estate). */
export function defaultCheckInStatus(trustedMs: number, utcOffsetMinutes: number, workStart: string): AttStatus {
  const [h, m] = workStart.split(':').map(Number) as [number, number];
  const local = new Date(trustedMs + utcOffsetMinutes * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minutes > h * 60 + m ? 'terlambat' : 'hadir';
}
