import { randomUUID } from 'node:crypto';

import { saveAttendance } from '@/db/repositories/attendance';
import { createTicket } from '@/db/repositories/harvest';
import { applyMasterChanges } from '@/db/repositories/master';
import {
  createSpb,
  isAfterRestanCutoff,
  potentialRestan,
  spbAfdelingCode,
  spbLines,
  spbLoadLines,
  spbTotals,
  validateSpb,
  type SpbInput,
  type SpbTicket,
} from '@/db/repositories/transport';
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
    changes: { tph: { upserts: [{ id: 1, code: 'A01-T1', block_id: 1 }] }, vehicle: { upserts: [{ id: 1, plate: 'BM 8101 AK', type: 'Dump Truck' }] } },
  });
  applyMasterChanges(db, page.changes, page.cursor);
  saveAttendance(db, [attendanceRow({ employeeId: 10, gangId: 1, workDate: D })]);
  return db;
}

const tk = (uuid: string = randomUUID(), no = 'AFD01-261018-CD34-0001'): SpbTicket => ({
  uuid,
  ticketNo: no,
  blockCode: 'A01',
  tphCode: 'A01-T1',
  bunches: 20,
  estKg: 370,
  looseFruitKg: 2,
  loadBunches: 20,
  loadLooseKg: 2,
});
const input = (over: Partial<SpbInput> = {}): SpbInput => ({
  workDate: D,
  vehicleId: 1,
  driverName: 'Budi',
  driverEmployeeId: null,
  pksId: null,
  transferPoint: null,
  destination: 'internal_mill',
  parentSpbUuid: null,
  tickets: [tk()],
  photoIds: [randomUUID(), randomUUID()],
  ...over,
});
const save = (db: ReturnType<typeof setup>, i: SpbInput) => createSpb(db, { ...txCommon(), status: 'queued' }, i, 'AFD01', 'AB12', []);

describe('SPB', () => {
  it('validasi dasar: kendaraan, sopir, tiket, minimal 2 foto, tiket ganda', () => {
    const db = setup();
    expect(validateSpb(db, input())).toEqual([]);
    const t = tk();
    expect(validateSpb(db, input({ vehicleId: 9, driverName: ' ', tickets: [], photoIds: ['a', 'a'] })).map((i) => i.code)).toEqual([
      'unknown_vehicle',
      'driver_required',
      'no_tickets',
      'photos_required',
    ]);
    expect(validateSpb(db, input({ tickets: [t, t] }))).toEqual([{ code: 'duplicate_ticket', tickets: [t.uuid] }]);
  });

  it('nomor SPB offline, total dari tiket, baris tersimpan', () => {
    const db = setup();
    const tickets = [tk(), tk(randomUUID(), 'AFD01-261018-CD34-0002')];
    const r = save(db, input({ tickets }));
    expect(r.spbNo).toBe('AFD01-261018-AB12-0001');
    expect(spbLines(db, r.mobileUuid)).toHaveLength(2);
    expect(spbTotals(tickets)).toEqual({ totalBunch: 40, estKg: 740 });
  });

  it('satu tiket hanya di satu SPB; langsir boleh meneruskan tiket induk', () => {
    const db = setup();
    const t = tk();
    const parent = save(db, input({ tickets: [t] }));
    expect(validateSpb(db, input({ tickets: [t] }))).toEqual([{ code: 'ticket_already_transported', tickets: [t.ticketNo] }]);
    expect(validateSpb(db, input({ tickets: [t], parentSpbUuid: parent.mobileUuid }))).toEqual([]);
    expect(validateSpb(db, input({ parentSpbUuid: randomUUID() })).map((i) => i.code)).toEqual(['unknown_parent']);
  });

  it('potensi restan = tiket hari itu yang belum masuk SPB', () => {
    const db = setup();
    const a = createTicket(db, { ...txCommon(), status: 'queued' }, { workDate: D, tphId: 1, blockId: 1, harvesterEmployeeId: 10, ripe: 10, unripe: 0, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 0 }, 185, 'CD34');
    createTicket(db, { ...txCommon(), status: 'queued' }, { workDate: D, tphId: 1, blockId: 1, harvesterEmployeeId: 10, ripe: 5, unripe: 0, rotten: 0, emptyBunch: 0, longStalk: 0, looseFruitKg: 0 }, 92.5, 'CD34');
    expect(potentialRestan(db, D)).toHaveLength(2);
    save(db, input({ tickets: [tk(a.mobileUuid, a.ticketNo)] }));
    expect(potentialRestan(db, D)).toHaveLength(1);
  });

  it('kode afdeling SPB dari blok tiket, lalu fallback', () => {
    const db = setup();
    expect(spbAfdelingCode(db, [tk()], [])).toBe('AFD01');
    expect(spbAfdelingCode(db, [{ ...tk(), blockCode: 'ZZ9' }], [1])).toBe('AFD01');
    expect(spbAfdelingCode(db, [], [])).toBe('AFD');
  });

  it('batas jam restan (zona estate)', () => {
    const at = (h: string) => Date.parse(`2026-10-18T${h}:00+07:00`);
    expect(isAfterRestanCutoff(at('15:59'), 420, '16:00')).toBe(false);
    expect(isAfterRestanCutoff(at('16:00'), 420, '16:00')).toBe(true);
  });

  describe('struktur SPB ERP', () => {
    const withErpMasters = () => {
      const db = setup();
      const page = masterResponseSchema.parse({
        cursor: 'v3',
        server_time: '2026-10-18T00:00:00Z',
        changes: {
          vehicle: { upserts: [{ id: 1, plate: 'BM 8101 AK', type: 'Dump Truck', ownership: 'own' }, { id: 2, plate: 'BM 7 SW', type: 'Colt', ownership: 'rental' }] },
          employee: { upserts: [{ id: 30, nik: 'S1', name: 'Bambang', type: 'SKU', active: true, role: 'sopir' }] },
          pks: { upserts: [{ id: 3, code: 'PKSSM', name: 'PKS Sei Meranti', estate_id: 1 }] },
        },
      });
      applyMasterChanges(db, page.changes, page.cursor);
      return db;
    };

    it('truk sendiri wajib sopir karyawan; truk sewa cukup nama; PKS wajib bila ada master PKS', () => {
      const db = withErpMasters();
      expect(validateSpb(db, input()).map((i) => i.code)).toEqual(['driver_employee_required', 'pks_required']);
      expect(validateSpb(db, input({ driverEmployeeId: 10, pksId: 3 })).map((i) => i.code)).toEqual(['driver_employee_required']);
      expect(validateSpb(db, input({ driverEmployeeId: 30, pksId: 3 }))).toEqual([]);
      expect(validateSpb(db, input({ vehicleId: 2, driverName: ' ', pksId: 3 })).map((i) => i.code)).toEqual(['driver_required']);
    });

    it('muatan sebagian: total ikut muatan, baris menyimpan janjang & brondolan; muatan tidak valid ditolak', () => {
      const db = withErpMasters();
      const partial = { ...tk(), loadBunches: 15, loadLooseKg: 0 };
      expect(spbTotals([partial])).toEqual({ totalBunch: 15, estKg: 277.5 });
      const r = save(db, input({ driverEmployeeId: 30, pksId: 3, transferPoint: 'Simpang 3', tickets: [partial] }));
      expect(spbLoadLines(db, r.mobileUuid)).toMatchObject([{ bunchCount: 15, looseFruitKg: 0 }]);
      const bad = [{ ...tk(), loadBunches: 21 }, { ...tk(randomUUID(), 'AFD01-261018-CD34-0009'), loadBunches: 0, loadLooseKg: 0 }];
      expect(validateSpb(db, input({ driverEmployeeId: 30, pksId: 3, tickets: bad }))).toEqual([
        { code: 'load_invalid', tickets: ['AFD01-261018-CD34-0001', 'AFD01-261018-CD34-0009'] },
      ]);
    });
  });
});
