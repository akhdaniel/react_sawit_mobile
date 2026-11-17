import { eq } from 'drizzle-orm';

import { saveAttendance } from '@/db/repositories/attendance';
import { canCorrect, createTicket, effectiveTickets, findDuplicateTicket, ticketPremi, ticketViews, transportedTicketUuids, validateTicket } from '@/db/repositories/harvest';
import { applyMasterChanges } from '@/db/repositories/master';
import { harvestTicket, spb, spbLine } from '@/db/schema';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { attendanceRow, seedMaster, txCommon, uuid } from '@/test/fixtures';

const D = '2026-10-18';
const base = { workDate: D, tphId: 1, blockId: 1, subBlokId: null as number | null, harvesterEmployeeId: 10, ripe: 20, unripe: 0, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 0 };

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
    expect(findDuplicateTicket(db, D, 1, 10, null, b.mobileUuid)?.mobileUuid).toBe(a.mobileUuid);
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

  describe('struktur tiket panen ERP', () => {
    const withSubBloks = () => {
      const db = setup();
      const page = masterResponseSchema.parse({
        cursor: 'v3',
        server_time: '2026-10-18T00:00:00.000Z',
        changes: {
          sub_blok: { upserts: [{ id: 5, code: 'A', block_id: 1, terrain_class_id: 1 }, { id: 6, code: 'B', block_id: 1, terrain_class_id: 2 }, { id: 7, code: 'A', block_id: 2, terrain_class_id: 1 }] },
          employee: { upserts: [{ id: 10, nik: '1401001', name: 'Agus', type: 'SKU', gang_id: 1, active: true, employee_type: 'daily_worker' }] },
          harvest_rate: {
            upserts: [
              { id: 1, estate_id: null, employee_type: null, date_from: '2026-01-01', lines: [{ grade: 'ripe', line_type: 'premium', basis: 'per_bunch', scope: 'all', amount: 100 }] },
              {
                id: 2, estate_id: 1, employee_type: 'daily_worker', date_from: '2026-01-01', date_to: '2026-12-31',
                lines: [
                  { grade: 'ripe', line_type: 'premium', basis: 'per_kg', scope: 'all', terrain_class_id: 1, amount: 500 },
                  { grade: 'ripe', line_type: 'premium', basis: 'per_kg', scope: 'all', terrain_class_id: 2, amount: 600 },
                  { grade: 'unripe', line_type: 'penalty', basis: 'per_kg', scope: 'all', amount: 100 },
                  { grade: 'loose_fruit', line_type: 'premium', basis: 'per_kg', scope: 'all', amount: 500 },
                  { grade: 'ripe', line_type: 'premium', basis: 'per_bunch', scope: 'over_basis', amount: 9999 },
                ],
              },
            ],
          },
        },
      });
      applyMasterChanges(db, page.changes, page.cursor);
      return db;
    };

    it('sub blok wajib bila blok punya sub blok, dan harus milik blok', () => {
      const db = withSubBloks();
      expect(validateTicket(db, base)).toEqual(['sub_blok_required']);
      expect(validateTicket(db, { ...base, subBlokId: 7 })).toEqual(['sub_blok_mismatch']);
      expect(validateTicket(db, { ...base, subBlokId: 5 })).toEqual([]);
    });

    it('susulan per TPH + sub blok + pemanen + tanggal (kunci tiket ERP)', () => {
      const db = withSubBloks();
      const a = create(db, { subBlokId: 5 });
      expect(create(db, { subBlokId: 6 }).isLateEntry).toBe(false);
      expect(create(db, { subBlokId: 5 }).isLateEntry).toBe(true);
      expect(db.select().from(harvestTicket).where(eq(harvestTicket.mobileUuid, a.mobileUuid)).get()?.subBlokId).toBe(5);
    });

    it('premi dari tarif ERP paling spesifik: per kg × BJR, kelas medan sub blok, denda, brondolan', () => {
      const db = withSubBloks();
      const counts = { ripe: 20, unripe: 2, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 10 };
      const r = ticketPremi(db, { workDate: D, blockId: 1, subBlokId: 6, harvesterEmployeeId: 10 }, counts);
      expect(r.bjrKg).toBe(18.5);
      // Matang 20 × 18,5 × 600 (kelas medan 2) + brondolan 10 × 500 − mentah 2 × 18,5 × 100; baris lebih basis diabaikan.
      expect(r.premi).toMatchObject({ hasRate: true, premium: 227000, penalty: 3700, net: 223300 });
      expect(r.premi.lines.map((l) => [l.grade, l.subtotal])).toEqual([['ripe', 222000], ['unripe', -3700], ['loose_fruit', 5000]]);
      // Pemanen tanpa tipe karyawan memakai tarif umum.
      const other = ticketPremi(db, { workDate: D, blockId: 1, subBlokId: 6, harvesterEmployeeId: 11 }, counts);
      expect(other.premi.net).toBe(2000);
      expect(ticketPremi(db, { workDate: '2025-06-01', blockId: 1, subBlokId: 6, harvesterEmployeeId: 10 }, counts).premi.hasRate).toBe(false);
    });
  });
});
