import { eq } from 'drizzle-orm';

import {
  applyPushResults,
  applyStatusResults,
  buildTxItem,
  collectOutbox,
  listAwaitingPost,
  listPendingPhotos,
  listRejected,
  markSent,
} from '@/db/repositories/outbox';
import { attendance, harvestTicket, photo, spb, spbLine } from '@/db/schema';
import { createTestDb } from '@/test/db';
import { attendanceRow, harvestTicketRow, photoRow, txCommon, uuid } from '@/test/fixtures';

describe('outbox', () => {
  it('membangun item kontrak dari baris lokal (payload + meta, tanpa kolom status)', () => {
    const { db } = createTestDb();
    const row = harvestTicketRow({ ticketNo: 'AFD01-261018-AB12-0007' });
    db.insert(harvestTicket).values(row).run();
    const stored = db.select().from(harvestTicket).get()!;
    const built = buildTxItem(db, 'harvest_ticket', stored as never, '0.3.0');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.item.type).toBe('harvest_ticket');
    expect(built.item.payload).toMatchObject({ ticket_no: 'AFD01-261018-AB12-0007', ripe: 20, is_late_entry: false });
    expect(built.item.meta).toMatchObject({ user_id: 7, device_id: 'dev-test-001', time_source: 'server', app_version: '0.3.0' });
    expect(built.item.payload).not.toHaveProperty('status');
  });

  it('SPB membawa harvest_ticket_uuids dari spb_line', () => {
    const { db } = createTestDb();
    const spbUuid = uuid();
    const t1 = uuid();
    db.insert(spb)
      .values({
        ...txCommon({ mobileUuid: spbUuid }),
        workDate: '2026-10-18',
        spbNo: 'AFD01-261018-AB12-0001',
        vehicleId: 1,
        driverName: 'Budi',
        destination: 'internal_mill',
        totalBunch: 10,
        estKg: 185,
        photoIds: [uuid(), uuid()],
        status: 'queued',
      })
      .run();
    db.insert(spbLine).values({ spbUuid, harvestTicketUuid: t1 }).run();
    const { entries } = collectOutbox(db, 10, '0.3.0');
    expect(entries[0]!.item.payload).toMatchObject({ harvest_ticket_uuids: [t1] });
  });

  it('urutan dependensi: absen sebelum tiket panen; termasuk status sent (kirim ulang)', () => {
    const { db } = createTestDb();
    db.insert(harvestTicket).values(harvestTicketRow({ createdTrustedAt: '2026-10-18T00:00:00.000Z' })).run();
    db.insert(attendance).values(attendanceRow({ createdTrustedAt: '2026-10-18T05:00:00.000Z', status: 'sent' })).run();
    db.insert(attendance).values(attendanceRow({ status: 'draft' })).run();
    db.insert(attendance).values(attendanceRow({ status: 'accepted' })).run();
    const { entries } = collectOutbox(db, 10, '0.3.0');
    expect(entries.map((e) => e.type)).toEqual(['attendance', 'harvest_ticket']);
  });

  it('item yang gagal validasi lokal dipisah dan tidak dikirim', () => {
    const { db } = createTestDb();
    db.insert(attendance).values(attendanceRow({ attStatus: 'terlambat', lateReason: null })).run();
    const { entries, invalid } = collectOutbox(db, 10, '0.3.0');
    expect(entries).toHaveLength(0);
    expect(invalid[0]!.error).toMatch(/late_reason/);
  });

  it('markSent → applyPushResults: accepted, duplicate, rejected, missing', () => {
    const { db } = createTestDb();
    const rows = [harvestTicketRow(), harvestTicketRow(), harvestTicketRow(), harvestTicketRow()];
    rows.forEach((r) => db.insert(harvestTicket).values(r).run());
    const { entries } = collectOutbox(db, 10, '0.3.0');
    markSent(db, entries, '2026-10-18T09:00:00.000Z');
    const s = applyPushResults(db, entries, [
      { mobile_uuid: rows[0]!.mobileUuid, status: 'accepted', server_id: 11 },
      { mobile_uuid: rows[1]!.mobileUuid, status: 'duplicate', server_id: 12 },
      { mobile_uuid: rows[2]!.mobileUuid, status: 'rejected', reason: 'no_check_in' },
    ]);
    expect(s).toEqual({ accepted: 1, duplicate: 1, rejected: 1, missing: 1 });
    const get = (i: number) => db.select().from(harvestTicket).where(eq(harvestTicket.mobileUuid, rows[i]!.mobileUuid)).get()!;
    expect(get(0)).toMatchObject({ status: 'accepted', serverId: 11, sentAt: '2026-10-18T09:00:00.000Z' });
    expect(get(1)).toMatchObject({ status: 'accepted', serverId: 12 });
    expect(get(2)).toMatchObject({ status: 'rejected', rejectReason: 'no_check_in' });
    expect(get(3).status).toBe('sent');
  });

  it('status polling: accepted → posted / rejected', () => {
    const { db } = createTestDb();
    const a = harvestTicketRow({ status: 'accepted' });
    const b = harvestTicketRow({ status: 'accepted' });
    db.insert(harvestTicket).values([a, b]).run();
    const awaiting = listAwaitingPost(db, 10);
    expect(awaiting).toHaveLength(2);
    const s = applyStatusResults(db, awaiting, [
      { mobile_uuid: a.mobileUuid, status: 'posted', posted_at: '2026-10-18T10:00:00.000Z' },
      { mobile_uuid: b.mobileUuid, status: 'rejected', reason: 'periode tutup' },
    ]);
    expect(s).toEqual({ posted: 1, rejected: 1 });
    expect(listAwaitingPost(db, 10)).toHaveLength(0);
  });

  it('listRejected menyembunyikan transaksi yang sudah dikoreksi', () => {
    const { db } = createTestDb();
    const a = harvestTicketRow({ status: 'rejected', rejectReason: 'est_kg_mismatch' });
    const b = harvestTicketRow({ status: 'rejected', rejectReason: 'x' });
    db.insert(harvestTicket).values([a, b]).run();
    db.insert(harvestTicket).values(harvestTicketRow({ correctionOf: b.mobileUuid })).run();
    expect(listRejected(db).map((r) => r.mobileUuid)).toEqual([a.mobileUuid]);
  });

  it('foto diunggah hanya setelah transaksinya dikenal server', () => {
    const { db } = createTestDb();
    const queued = harvestTicketRow({ status: 'queued' });
    const accepted = harvestTicketRow({ status: 'accepted' });
    db.insert(harvestTicket).values([queued, accepted]).run();
    const p1 = photoRow({ transactionUuid: queued.mobileUuid });
    const p2 = photoRow({ transactionUuid: accepted.mobileUuid });
    const p3 = photoRow({ transactionUuid: null });
    db.insert(photo).values([p1, p2, p3]).run();
    expect(listPendingPhotos(db, 10).map((p) => p.id)).toEqual([p2.id]);
  });
});
