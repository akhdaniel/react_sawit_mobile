import { randomUUID as nodeUUID } from 'node:crypto';

import { checkIn, checkOut, correctCheckIn, isOutsideAfdeling } from '@/features/attendance/actions';
import { createAssignment } from '@/features/attendance/assignment-actions';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';
import { attendanceByEmployee } from '@/db/repositories/attendance';
import { assignment, attendance, photo } from '@/db/schema';
import { createTestDb } from '@/test/db';
import { seedMaster } from '@/test/fixtures';

jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const D = '2026-10-18';
const ctx = (over: Partial<TxContext> = {}): TxContext => ({
  userId: 101,
  deviceId: 'and-x',
  trusted: { ms: 0, iso: '2026-10-18T00:05:00.000Z', source: 'server', reason: null, anchorAgeMs: 1, deviceSkewMs: 0 },
  deviceNowIso: '2026-10-18T00:05:02.000Z',
  fix: { lat: 0.52, lng: 101.41, accuracyM: 6, mocked: false, timestampMs: 0, source: 'current' },
  rooted: false,
  ...over,
});
const photo1 = () => ({ id: nodeUUID(), localUri: 'file:///p.jpg', sizeBytes: 200_000, sha256: 'c'.repeat(64), quality: 0.6, maxEdge: 1280 });

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  return db;
}

describe('aksi absensi', () => {
  it('makeTxCommon mengisi kolom anti-fraud', () => {
    const c = makeTxCommon(ctx({ rooted: true, fix: { lat: 1, lng: 2, accuracyM: null, mocked: true, timestampMs: 0, source: 'last_known' } }), 'u1');
    expect(c).toEqual({
      mobileUuid: 'u1',
      userId: 101,
      deviceId: 'and-x',
      createdTrustedAt: '2026-10-18T00:05:00.000Z',
      deviceTimeAt: '2026-10-18T00:05:02.000Z',
      timeSource: 'server',
      lat: 1,
      lng: 2,
      accuracyM: null,
      mocked: true,
      rooted: true,
      status: 'queued',
      correctionOf: null,
    });
  });

  it('absen masuk massal dengan foto grup → baris queued + foto tertaut', () => {
    const db = setup();
    const p = photo1();
    const r = checkIn(db, ctx(), { workDate: D, gangId: 1, photo: p, entries: [{ employeeId: 10, attStatus: 'hadir' }, { employeeId: 11, attStatus: 'hadir' }] });
    expect(r).toEqual({ ok: true, count: 2, outside: false, noLocation: false });
    const rows = db.select().from(attendance).all();
    expect(rows.every((x) => x.status === 'queued' && x.photoId === p.id && x.lat === 0.52 && !x.outsideAfdeling)).toBe(true);
    expect(db.select().from(photo).get()).toMatchObject({ id: p.id, sha256: 'c'.repeat(64), transactionUuid: rows[0]!.mobileUuid });
  });

  it('di luar polygon afdeling → ditandai, tidak diblokir', () => {
    const db = setup();
    const far = ctx({ fix: { lat: 1.2, lng: 102.5, accuracyM: 5, mocked: false, timestampMs: 0, source: 'current' } });
    expect(isOutsideAfdeling(db, 1, far)).toBe(true);
    expect(isOutsideAfdeling(db, 1, ctx({ fix: null }))).toBe(false);
    const r = checkIn(db, far, { workDate: D, gangId: 1, entries: [{ employeeId: 10, attStatus: 'hadir' }] });
    expect(r).toMatchObject({ ok: true, outside: true });
    expect(db.select().from(attendance).get()?.outsideAfdeling).toBe(true);
  });

  it('pelanggaran aturan tidak menyimpan apa pun', () => {
    const db = setup();
    checkIn(db, ctx(), { workDate: D, gangId: 2, entries: [{ employeeId: 20, attStatus: 'hadir' }] });
    const r = checkIn(db, ctx(), { workDate: D, gangId: 1, entries: [{ employeeId: 10, attStatus: 'hadir' }, { employeeId: 20, attStatus: 'hadir' }] });
    expect(r.ok).toBe(false);
    expect(db.select().from(attendance).all()).toHaveLength(1);
  });

  it('pulang, koreksi, lalu penugasan hanya untuk yang hadir', () => {
    const db = setup();
    checkIn(db, ctx(), { workDate: D, gangId: 1, entries: [{ employeeId: 10, attStatus: 'hadir' }, { employeeId: 11, attStatus: 'sakit' }] });
    expect(createAssignment(db, ctx(), { workDate: D, workPlanId: 1, unplannedReason: null, activityId: 1, blockId: 1, employeeIds: [10, 11] })).toMatchObject({
      ok: false,
    });
    const sick = attendanceByEmployee(db, D).get(11)!.checkIn!;
    expect(correctCheckIn(db, ctx(), sick, 'hadir', null, photo1()).ok).toBe(true);
    const a = createAssignment(db, ctx(), { workDate: D, workPlanId: 1, unplannedReason: null, activityId: 1, blockId: 1, employeeIds: [10, 11, 11] });
    expect(a.ok).toBe(true);
    expect(db.select().from(assignment).get()).toMatchObject({ employeeIds: [10, 11], workPlanId: 1, unplannedReason: null, status: 'queued' });
    expect(checkOut(db, ctx(), { workDate: D, gangId: 1, employeeIds: [10] })).toMatchObject({ ok: true, count: 1 });
  });
});
