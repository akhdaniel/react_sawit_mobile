import { eq } from 'drizzle-orm';

import { harvestTicket, photo, spb, spbLine } from '@/db/schema';
import { canTransition, TX_STATUSES, type TxStatus } from '@/db/tx-status';
import { createTestDb } from '@/test/db';
import { harvestTicketRow, txCommon, uuid } from '@/test/fixtures';

function setup(status: TxStatus = 'queued') {
  const { db } = createTestDb();
  const row = harvestTicketRow({ status });
  db.insert(harvestTicket).values(row).run();
  const where = eq(harvestTicket.mobileUuid, row.mobileUuid);
  return { db, row, where };
}

describe('trigger append-only', () => {
  it('kolom bisnis boleh diubah saat draft/queued', () => {
    const { db, where } = setup('queued');
    db.update(harvestTicket).set({ ripe: 25 }).where(where).run();
    expect(db.select().from(harvestTicket).where(where).get()?.ripe).toBe(25);
  });

  it.each(['sent', 'accepted', 'rejected', 'posted'] as const)('menolak ubah kolom bisnis saat %s', (status) => {
    const { db, where } = setup(status);
    expect(() => db.update(harvestTicket).set({ ripe: 99 }).where(where).run()).toThrow(/TX_APPEND_ONLY/);
    expect(() => db.update(harvestTicket).set({ lat: 1 }).where(where).run()).toThrow(/TX_APPEND_ONLY/);
  });

  it('sync engine tetap boleh memperbarui kolom status setelah terkirim', () => {
    const { db, where } = setup('sent');
    db.update(harvestTicket).set({ status: 'accepted', serverId: 501, sentAt: '2026-10-18T09:00:00Z' }).where(where).run();
    db.update(harvestTicket).set({ status: 'posted', postedAt: '2026-10-18T10:00:00Z' }).where(where).run();
    expect(db.select().from(harvestTicket).where(where).get()?.status).toBe('posted');
  });

  it('matriks transisi status sama persis dengan TX_TRANSITIONS', () => {
    for (const from of TX_STATUSES) {
      for (const to of TX_STATUSES) {
        const { db, where } = setup(from);
        const run = () => db.update(harvestTicket).set({ status: to }).where(where).run();
        if (canTransition(from, to)) expect(run).not.toThrow();
        else expect(run).toThrow(/TX_INVALID_TRANSITION/);
      }
    }
  });

  it('menolak status tidak dikenal saat insert', () => {
    const { db } = createTestDb();
    expect(() =>
      db.insert(harvestTicket).values(harvestTicketRow({ status: 'bogus' as never })).run(),
    ).toThrow(/TX_INVALID_STATUS/);
  });

  it('hanya draft yang boleh dihapus', () => {
    const draft = setup('draft');
    expect(() => draft.db.delete(harvestTicket).where(draft.where).run()).not.toThrow();
    const queued = setup('queued');
    expect(() => queued.db.delete(harvestTicket).where(queued.where).run()).toThrow(/TX_APPEND_ONLY/);
  });

  it('koreksi = transaksi baru yang merujuk mobile_uuid asal', () => {
    const { db, row, where } = setup('accepted');
    const fix = harvestTicketRow({ correctionOf: row.mobileUuid, ripe: 18 });
    db.insert(harvestTicket).values(fix).run();
    expect(db.select().from(harvestTicket).where(where).get()?.ripe).toBe(row.ripe);
    expect(db.select().from(harvestTicket).where(eq(harvestTicket.correctionOf, row.mobileUuid)).get()?.ripe).toBe(18);
  });

  it('baris SPB terkunci mengikuti status SPB induk', () => {
    const { db } = createTestDb();
    const spbUuid = uuid();
    db.insert(spb)
      .values({
        ...txCommon({ mobileUuid: spbUuid }),
        workDate: '2026-10-18',
        spbNo: 'AFD01-261018-AB12-0001',
        vehicleId: 1,
        driverName: 'Budi',
        destination: 'internal_mill',
        totalBunch: 40,
        estKg: 740,
        photoIds: [uuid(), uuid()],
        status: 'queued',
      })
      .run();
    db.insert(spbLine).values({ spbUuid, harvestTicketUuid: uuid() }).run();
    db.update(spb).set({ status: 'sent' }).where(eq(spb.mobileUuid, spbUuid)).run();
    expect(() => db.insert(spbLine).values({ spbUuid, harvestTicketUuid: uuid() }).run()).toThrow(/TX_APPEND_ONLY/);
    expect(() => db.delete(spbLine).where(eq(spbLine.spbUuid, spbUuid)).run()).toThrow(/TX_APPEND_ONLY/);
  });

  it('bukti foto (hash/waktu/lokasi) tidak bisa diubah', () => {
    const { db } = createTestDb();
    const id = uuid();
    db.insert(photo)
      .values({
        id,
        localUri: 'file:///x.jpg',
        sha256: 'a'.repeat(64),
        sizeBytes: 1000,
        takenTrustedAt: '2026-10-18T01:00:00Z',
      })
      .run();
    const where = eq(photo.id, id);
    expect(() => db.update(photo).set({ sha256: 'b'.repeat(64) }).where(where).run()).toThrow(/PHOTO_IMMUTABLE/);
    db.update(photo).set({ uploadStatus: 'uploaded', serverPhotoId: 9 }).where(where).run();
    expect(() => db.delete(photo).where(where).run()).toThrow(/PHOTO_IMMUTABLE/);
  });
});
