import { eq } from 'drizzle-orm';

import { harvestTicket, photo } from '@/db/schema';
import { getMeta, setMeta } from '@/db/repositories/meta';
import { getPendingSummary } from '@/db/repositories/pending';
import { nextDocNo } from '@/db/repositories/sequence';
import { createTestDb } from '@/test/db';
import { harvestTicketRow, uuid } from '@/test/fixtures';

describe('getPendingSummary', () => {
  it('menghitung queued + sent, tidak termasuk draft/accepted', () => {
    const { db } = createTestDb();
    for (const status of ['draft', 'queued', 'queued', 'sent', 'accepted', 'posted'] as const) {
      db.insert(harvestTicket).values(harvestTicketRow({ status })).run();
    }
    db.insert(photo)
      .values({ id: uuid(), localUri: 'file:///a.jpg', sha256: 'c'.repeat(64), sizeBytes: 1, takenTrustedAt: '2026-10-18T01:00:00Z' })
      .run();
    const s = getPendingSummary(db);
    expect(s.total).toBe(3);
    expect(s.byType.harvest_ticket).toBe(3);
    expect(s.byType.spb).toBe(0);
    expect(s.photos).toBe(1);
  });

  it('turun setelah server menerima', () => {
    const { db } = createTestDb();
    const row = harvestTicketRow({ status: 'sent' });
    db.insert(harvestTicket).values(row).run();
    db.update(harvestTicket).set({ status: 'accepted' }).where(eq(harvestTicket.mobileUuid, row.mobileUuid)).run();
    expect(getPendingSummary(db).total).toBe(0);
  });
});

describe('nextDocNo', () => {
  it('berurutan per prefix, terpisah per tanggal dan tipe', () => {
    const { db } = createTestDb();
    expect(nextDocNo(db, 'harvest_ticket', 'AFD01', '2026-10-18', 'AB12')).toBe('AFD01-261018-AB12-0001');
    expect(nextDocNo(db, 'harvest_ticket', 'AFD01', '2026-10-18', 'AB12')).toBe('AFD01-261018-AB12-0002');
    expect(nextDocNo(db, 'harvest_ticket', 'AFD01', '2026-10-19', 'AB12')).toBe('AFD01-261019-AB12-0001');
    expect(nextDocNo(db, 'spb', 'AFD01', '2026-10-18', 'AB12')).toBe('AFD01-261018-AB12-0001');
    expect(nextDocNo(db, 'harvest_ticket', 'AFD02', '2026-10-18', 'AB12')).toBe('AFD02-261018-AB12-0001');
  });
});

describe('app_meta', () => {
  it('get/set', () => {
    const { db } = createTestDb();
    expect(getMeta(db, 'device_id')).toBeNull();
    setMeta(db, 'device_id', 'x');
    setMeta(db, 'device_id', 'y');
    expect(getMeta(db, 'device_id')).toBe('y');
  });
});
