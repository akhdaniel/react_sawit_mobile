import { eq } from 'drizzle-orm';

import { saveAttendance } from '@/db/repositories/attendance';
import { canCorrect, createTicket, effectiveTickets, findDuplicateTicket, ticketViews, transportedTicketUuids, validateTicket } from '@/db/repositories/harvest';
import { applyMasterChanges } from '@/db/repositories/master';
import { harvestTicket, spb, spbLine } from '@/db/schema';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster, txCommon, uuid } from '@/test/fixtures';

const D = '2026-10-18';
const base = { workDate: D, tphId: 1, blockId: 1, harvesterEmployeeId: 10, ripe: 20, unripe: 0, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 0 };

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  const page = masterResponseSchema.parse({
    cursor: 'v2',
    server_time: '2026-10-18T00:00:00.000Z',
    changes: {
      tph: { upserts: [{ id: 1, code: 'A01-T1', block_id: 1, lat: 0.5, lng: 101.4 }, { id: 2, code: 'B01-T1', block_id: 2, lat: 0.5, lng: 101.4 }] },
      block: { upserts: [{ id: 2, code: 'B01', afdeling_id: 1, ha: 20, planting_year: 2023, status: 'TBM', bjr_kg: 0, polygon_geojson: null }] },
    },
  });
  applyMasterChanges(db, page.changes, page.cursor);
  saveAttendance(db, [attendanceRow({ employeeId: 10, gangId: 1, workDate: D })]);
  return db;
}

const create = (db: ReturnType<typeof setup>, over: Partial<typeof base> & { correctionOf?: string } = {}) =>
  createTicket(db, { ...txCommon(), status: 'queued' }, { ...base, ...over }, 370, 'AB12');

describe('tiket panen', () => {
  it('validasi: pemanen hadir, TPH milik blok, blok TM, isi tidak kosong', () => {
    const db = setup();
    expect(validateTicket(db, base)).toEqual([]);
    expect(validateTicket(db, { ...base, harvesterEmployeeId: 11 })).toEqual(['harvester_not_present']);
    expect(validateTicket(db, { ...base, tphId: 2 })).toEqual(['tph_block_mismatch']);
    expect(validateTicket(db, { ...base, tphId: 2, blockId: 2 })).toEqual(['block_not_tm']);
    expect(validateTicket(db, { ...base, ripe: 0 })).toEqual(['empty_ticket']);
    expect(validateTicket(db, { ...base, ripe: 0, looseFruitKg: 4 })).toEqual([]);
    expect(validateTicket(db, { ...base, ripe: 1.5 })).toEqual(['invalid_count']);
    expect(validateTicket(db, { ...base, tphId: 99 })).toEqual(['unknown_tph']);
  });

  it('nomor offline berurutan; tiket kedua TPH+pemanen+tanggal otomatis susulan', () => {
    const db = setup();
    const a = create(db);
    const b = create(db);
    expect(a).toMatchObject({ ticketNo: 'AFD01-261018-AB12-0001', isLateEntry: false });
    expect(b).toMatchObject({ ticketNo: 'AFD01-261018-AB12-0002', isLateEntry: true });
    expect(findDuplicateTicket(db, D, 1, 10, b.mobileUuid)?.mobileUuid).toBe(a.mobileUuid);
  });

  it('koreksi: nomor baru, tiket asal tidak efektif, susulan diwarisi; tidak bisa dikoreksi dua kali', () => {
    const db = setup();
    const a = create(db);
    const fix = create(db, { ripe: 18, correctionOf: a.mobileUuid });
    expect(fix.isLateEntry).toBe(false);
    expect(effectiveTickets(db, D).map((x) => x.mobileUuid)).toEqual([fix.mobileUuid]);
    expect(canCorrect(db, a.mobileUuid)).toBe(false);
    expect(validateTicket(db, { ...base, correctionOf: a.mobileUuid })).toEqual(['correction_target_invalid']);
    expect(db.select().from(harvestTicket).where(eq(harvestTicket.mobileUuid, a.mobileUuid)).get()?.ripe).toBe(20);
  });

  it('tiket ditolak server tetap bisa dikoreksi', () => {
    const db = setup();
    const a = create(db);
    db.update(harvestTicket).set({ status: 'sent' }).where(eq(harvestTicket.mobileUuid, a.mobileUuid)).run();
    db.update(harvestTicket).set({ status: 'rejected', rejectReason: 'est_kg_mismatch' }).where(eq(harvestTicket.mobileUuid, a.mobileUuid)).run();
    expect(canCorrect(db, a.mobileUuid)).toBe(true);
    expect(validateTicket(db, { ...base, correctionOf: a.mobileUuid })).toEqual([]);
  });

  it('terangkut bila masuk SPB yang tidak ditolak', () => {
    const db = setup();
    const a = create(db);
    const spbUuid = uuid();
    db.insert(spb)
      .values({ ...txCommon({ mobileUuid: spbUuid }), status: 'queued', workDate: D, spbNo: 'AFD01-261018-AB12-0001', vehicleId: 1, driverName: 'Budi', destination: 'internal_mill', totalBunch: 20, estKg: 370, photoIds: [uuid(), uuid()] })
      .run();
    expect(transportedTicketUuids(db).size).toBe(0);
    db.insert(spbLine).values({ spbUuid, harvestTicketUuid: a.mobileUuid }).run();
    expect(ticketViews(db, D)[0]).toMatchObject({ transported: true, tphCode: 'A01-T1', blockCode: 'A01', harvesterName: 'Agus' });
  });
});
