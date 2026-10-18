import { pendingInbox, replaceInbox } from '@/db/repositories/approval';
import { saveAttendance } from '@/db/repositories/attendance';
import { buildDailySummary, latestReport } from '@/db/repositories/daily-report';
import { createTicket } from '@/db/repositories/harvest';
import { applyMasterChanges } from '@/db/repositories/master';
import { collectOutbox } from '@/db/repositories/outbox';
import { approvalDecision, dailyReport, photo } from '@/db/schema';
import type { TxContext } from '@/features/common/tx-factory';
import { decide, submitDailyReport } from '@/features/report/actions';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster, txCommon } from '@/test/fixtures';

jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const D = '2026-10-18';
const T1 = '11111111-2222-4333-8444-555555555555';
const T2 = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const ctx: TxContext = {
  userId: 105,
  deviceId: 'and-asisten',
  trusted: { ms: 0, iso: '2026-10-18T09:00:00.000Z', source: 'server', reason: null, anchorAgeMs: 1, deviceSkewMs: 0 },
  deviceNowIso: '2026-10-18T09:00:00.000Z',
  fix: null,
  rooted: false,
};

describe('approval', () => {
  it('inbox diganti per afdeling; keputusan menyembunyikan item dan masuk outbox', () => {
    const { db } = createTestDb();
    replaceInbox(db, 1, [
      { target_uuid: T1, target_type: 'material_usage', summary: 'Material #1: 4 L', flags: ['over_dose'] },
      { target_uuid: T2, target_type: 'attendance', summary: 'Absen', flags: ['outside_afdeling'] },
    ], '2026-10-18T08:00:00Z');
    expect(pendingInbox(db)).toHaveLength(2);
    // sinkron berikut: T2 sudah diputuskan asisten lain di server → hilang
    replaceInbox(db, 1, [{ target_uuid: T1, target_type: 'material_usage', summary: 'Material #1: 4 L', flags: ['over_dose'] }], '2026-10-18T09:00:00Z');
    expect(pendingInbox(db).map((i) => i.targetUuid)).toEqual([T1]);

    expect(decide(db, ctx, T1, 'reject', ' ')).toEqual({ ok: false, code: 'note_required' });
    expect(decide(db, ctx, T1, 'correct', 'kurangi dosis')).toEqual({ ok: true });
    expect(pendingInbox(db)).toHaveLength(0);
    expect(decide(db, ctx, T1, 'approve', null)).toEqual({ ok: false, code: 'already_decided' });
    expect(db.select().from(approvalDecision).get()).toMatchObject({ targetType: 'material_usage', decision: 'correct', correctedJson: { instruction: 'kurangi dosis' } });
    expect(collectOutbox(db, 10, '1').entries.map((e) => e.item.type)).toEqual(['approval_decision']);
  });
});

describe('laporan harian', () => {
  function setup() {
    const { db } = createTestDb();
    seedMaster(db, D);
    applyMasterChanges(db, masterResponseSchema.parse({ cursor: 'v2', server_time: D + 'T00:00:00Z', changes: { tph: { upserts: [{ id: 1, code: 'A01-T1', block_id: 1 }] } } }).changes, 'v2');
    saveAttendance(db, [
      attendanceRow({ employeeId: 10, gangId: 1, workDate: D }),
      attendanceRow({ employeeId: 11, gangId: 1, workDate: D, attStatus: 'sakit' }),
      attendanceRow({ employeeId: 20, gangId: 2, workDate: D }),
      attendanceRow({ employeeId: 10, gangId: 1, workDate: D, type: 'check_out' }),
    ]);
    const base = { workDate: D, tphId: 1, blockId: 1, harvesterEmployeeId: 10, ripe: 10, unripe: 1, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 0 };
    createTicket(db, { ...txCommon(), status: 'queued' }, base, 203.5, 'AB12');
    createTicket(db, { ...txCommon(), status: 'queued' }, base, 203.5, 'AB12');
    return db;
  }

  it('ringkasan per gang dari data lokal', () => {
    const db = setup();
    expect(buildDailySummary(db, D, 1)).toEqual({
      date: D,
      gangId: 1,
      attendance: { hadir: 1, terlambat: 0, sakit: 1, izin: 0, mangkir: 0, pulang: 1 },
      assignments: 0,
      harvest: { tickets: 2, bunches: 22, estKg: 407, lateEntries: 1, notTransported: 2 },
      upkeep: { jobs: 0, hk: 0, ha: 0, overDose: 0 },
    });
    expect(buildDailySummary(db, D, 2).attendance.hadir).toBe(1);
  });

  it('laporan bertanda tangan; laporan kedua = koreksi', () => {
    const db = setup();
    const sig = (id: string) => ({ id, localUri: `file:///photos/${id}.png`, sizeBytes: 900, sha256: 'e'.repeat(64) });
    const first = submitDailyReport(db, ctx, D, 1, sig('aaaaaaaa-0000-4000-8000-000000000001'));
    expect(first.corrected).toBe(false);
    const second = submitDailyReport(db, ctx, D, 1, sig('aaaaaaaa-0000-4000-8000-000000000002'));
    expect(second.corrected).toBe(true);
    expect(latestReport(db, D, 1)?.mobileUuid).toBe(second.mobileUuid);
    expect(db.select().from(dailyReport).all().map((r) => r.correctionOf)).toEqual([null, first.mobileUuid]);
    expect(db.select().from(photo).all().map((p) => p.transactionUuid)).toEqual([first.mobileUuid, second.mobileUuid]);
    const items = collectOutbox(db, 50, '1').entries.filter((e) => e.type === 'daily_report');
    expect(items[0]!.item.payload).toMatchObject({ gang_id: 1, signature_png_id: 'aaaaaaaa-0000-4000-8000-000000000001' });
  });
});
