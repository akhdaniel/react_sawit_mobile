import { saveAttendance } from '@/db/repositories/attendance';
import { applyMasterChanges } from '@/db/repositories/master';
import { harvestTicket, photo } from '@/db/schema';
import type { TxContext } from '@/features/common/tx-factory';
import { saveHarvestTicket } from '@/features/harvest/actions';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster } from '@/test/fixtures';

jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const D = '2026-10-18';
const ctx: TxContext = {
  userId: 101,
  deviceId: 'and-x',
  trusted: { ms: 0, iso: '2026-10-18T02:00:00.000Z', source: 'device', reason: 'rebooted', anchorAgeMs: null, deviceSkewMs: 0 },
  deviceNowIso: '2026-10-18T02:00:01.000Z',
  fix: { lat: 0.51, lng: 101.41, accuracyM: 4, mocked: true, timestampMs: 0, source: 'current' },
  rooted: false,
};

it('menyimpan tiket dengan est_kg dari BJR, kolom anti-fraud, dan foto', () => {
  const { db } = createTestDb();
  seedMaster(db, D);
  applyMasterChanges(db, masterResponseSchema.parse({ cursor: 'v2', server_time: D + 'T00:00:00Z', changes: { tph: { upserts: [{ id: 1, code: 'A01-T1', block_id: 1 }] } } }).changes, 'v2');
  saveAttendance(db, [attendanceRow({ employeeId: 10, gangId: 1, workDate: D })]);
  const r = saveHarvestTicket(
    db,
    ctx,
    { workDate: D, tphId: 1, blockId: 1, harvesterEmployeeId: 10, ripe: 10, unripe: 2, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 1.5 },
    'Z9X1',
    { id: '0b0f4a6e-1b2c-4d3e-8f4a-5b6c7d8e9f00', localUri: 'file:///p.jpg', sizeBytes: 1, sha256: 'd'.repeat(64), quality: 0.6, maxEdge: 1280 },
  );
  expect(r).toMatchObject({ ok: true, ticket: { ticketNo: 'AFD01-261018-Z9X1-0001', estKg: 222, isLateEntry: false } });
  expect(db.select().from(harvestTicket).get()).toMatchObject({ mocked: true, timeSource: 'device', estKg: 222, looseFruitKg: 1.5, status: 'queued' });
  expect(db.select().from(photo).get()?.mocked).toBe(true);
  expect(saveHarvestTicket(db, ctx, { workDate: D, tphId: 1, blockId: 1, harvesterEmployeeId: 11, ripe: 1, unripe: 0, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 0 }, 'Z9X1')).toEqual({
    ok: false,
    issues: ['harvester_not_present'],
  });
});
