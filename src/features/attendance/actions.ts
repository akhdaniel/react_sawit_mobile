/**
 * Aksi absensi: membangun baris transaksi lengkap (kolom anti-fraud dari txContext),
 * memvalidasi aturan bisnis, lalu menyimpan ke SQLite. Tidak pernah memanggil API.
 */
import { randomUUID } from 'expo-crypto';
import { eq } from 'drizzle-orm';

import {
  saveAttendance,
  validateCheckIns,
  validateCheckOuts,
  validateCorrection,
  type AttendanceIssue,
  type AttendanceRow,
  type AttStatus,
  type CheckInEntry,
  type NewAttendance,
} from '@/db/repositories/attendance';
import type { NewPhoto } from '@/db/repositories/photos';
import { afdeling, gang } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CapturedPhoto } from '@/features/camera/CameraCapture';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';
import { isInsideGeojson } from '@/lib/geo';

export type AttendanceResult = { ok: true; count: number; outside: boolean; noLocation: boolean } | { ok: false; issues: AttendanceIssue[] };

/** true bila posisi berada di luar polygon afdeling gang (tidak memblokir, hanya flag). */
export function isOutsideAfdeling(db: AppDatabase, gangId: number, ctx: TxContext): boolean {
  if (!ctx.fix) return false;
  const row = db
    .select({ polygon: afdeling.polygonGeojson })
    .from(gang)
    .innerJoin(afdeling, eq(afdeling.id, gang.afdelingId))
    .where(eq(gang.id, gangId))
    .get();
  return isInsideGeojson(ctx.fix.lat, ctx.fix.lng, row?.polygon ?? null) === false;
}

function photoRow(p: CapturedPhoto, ctx: TxContext): NewPhoto {
  return {
    id: p.id,
    localUri: p.localUri,
    sha256: p.sha256,
    sizeBytes: p.sizeBytes,
    takenTrustedAt: ctx.trusted.iso,
    lat: ctx.fix?.lat ?? null,
    lng: ctx.fix?.lng ?? null,
    accuracyM: ctx.fix?.accuracyM ?? null,
    mocked: ctx.fix?.mocked ?? false,
  };
}

export function checkIn(
  db: AppDatabase,
  ctx: TxContext,
  args: { workDate: string; gangId: number; entries: CheckInEntry[]; photo?: CapturedPhoto },
): AttendanceResult {
  const issues = validateCheckIns(db, args.workDate, args.gangId, args.entries);
  if (issues.length) return { ok: false, issues };
  const outside = isOutsideAfdeling(db, args.gangId, ctx);
  const rows: NewAttendance[] = args.entries.map((e) => ({
    ...makeTxCommon(ctx, randomUUID()),
    workDate: args.workDate,
    employeeId: e.employeeId,
    gangId: args.gangId,
    type: 'check_in',
    attStatus: e.attStatus,
    lateReason: e.attStatus === 'terlambat' ? (e.lateReason?.trim() ?? null) : null,
    outsideAfdeling: outside,
  }));
  saveAttendance(db, rows, args.photo ? photoRow(args.photo, ctx) : undefined);
  return { ok: true, count: rows.length, outside, noLocation: !ctx.fix };
}

export function checkOut(db: AppDatabase, ctx: TxContext, args: { workDate: string; gangId: number; employeeIds: number[] }): AttendanceResult {
  const issues = validateCheckOuts(db, args.workDate, args.gangId, args.employeeIds);
  if (issues.length) return { ok: false, issues };
  const outside = isOutsideAfdeling(db, args.gangId, ctx);
  const rows: NewAttendance[] = args.employeeIds.map((employeeId) => ({
    ...makeTxCommon(ctx, randomUUID()),
    workDate: args.workDate,
    employeeId,
    gangId: args.gangId,
    type: 'check_out',
    attStatus: 'hadir',
    outsideAfdeling: outside,
  }));
  saveAttendance(db, rows);
  return { ok: true, count: rows.length, outside, noLocation: !ctx.fix };
}

/** Koreksi status check-in: baris baru dengan correction_of (baris asal tidak diubah). */
export function correctCheckIn(
  db: AppDatabase,
  ctx: TxContext,
  original: AttendanceRow,
  attStatus: AttStatus,
  lateReason: string | null,
  photo?: CapturedPhoto,
): AttendanceResult {
  const code = validateCorrection(db, original, attStatus, lateReason);
  if (code) return { ok: false, issues: [{ employeeId: original.employeeId, code }] };
  const outside = isOutsideAfdeling(db, original.gangId, ctx);
  saveAttendance(
    db,
    [
      {
        ...makeTxCommon(ctx, randomUUID(), original.mobileUuid),
        workDate: original.workDate,
        employeeId: original.employeeId,
        gangId: original.gangId,
        type: 'check_in',
        attStatus,
        lateReason: attStatus === 'terlambat' ? lateReason : null,
        outsideAfdeling: outside,
      },
    ],
    photo ? photoRow(photo, ctx) : undefined,
  );
  return { ok: true, count: 1, outside, noLocation: !ctx.fix };
}
