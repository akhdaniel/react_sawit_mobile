import { block, employee } from '@/db/schema';
import { applyMasterChanges, countMaster, getCursor } from '@/db/repositories/master';
import { masterResponseSchema } from '@/sync/contract';
import { createTestDb } from '@/test/db';

const ST = '2026-10-18T10:00:00.000Z';

function page(changes: unknown, cursor: string) {
  return masterResponseSchema.parse({ cursor, server_time: ST, changes });
}

const blk = (id: number, bjr = 18.5) => ({
  id, code: `B${id}`, afdeling_id: 1, ha: 30, planting_year: 2010, status: 'TM', bjr_kg: bjr,
  polygon_geojson: { type: 'Polygon', coordinates: [] },
});

describe('applyMasterChanges', () => {
  it('upsert awal, update, lalu delete via cursor', () => {
    const { db } = createTestDb();
    const p1 = page({ block: { upserts: [blk(1), blk(2)] } }, 'v1');
    expect(applyMasterChanges(db, p1.changes, p1.cursor)).toEqual({ upserted: 2, deleted: 0 });
    expect(getCursor(db)).toBe('v1');

    const p2 = page({ block: { upserts: [blk(1, 21)], deletes: [2] } }, 'v2');
    applyMasterChanges(db, p2.changes, p2.cursor);
    const rows = db.select().from(block).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, bjrKg: 21, afdelingId: 1, status: 'TM' });
    expect(typeof rows[0]?.polygonGeojson).toBe('string');
    expect(getCursor(db)).toBe('v2');
  });

  it('memetakan snake_case API ke kolom dan boolean', () => {
    const { db } = createTestDb();
    const p = page(
      { employee: { upserts: [{ id: 5, nik: '1401', name: 'Andi', type: 'SKU', gang_id: 3, active: false }] } },
      'v1',
    );
    applyMasterChanges(db, p.changes, p.cursor);
    expect(db.select().from(employee).get()).toEqual({ id: 5, nik: '1401', name: 'Andi', type: 'SKU', gangId: 3, active: false });
  });

  it('atomik: bila satu baris gagal, data dan cursor lama tetap', () => {
    const { db } = createTestDb();
    const p1 = page({ block: { upserts: [blk(1)] } }, 'v1');
    applyMasterChanges(db, p1.changes, p1.cursor);
    // Lolos dari zod secara paksa untuk mensimulasikan baris rusak (NOT NULL).
    const broken = { block: { upserts: [blk(3), { ...blk(4), code: null }], deletes: [1] } };
    expect(() => applyMasterChanges(db, broken as never, 'v2')).toThrow();
    expect(getCursor(db)).toBe('v1');
    expect(db.select().from(block).all().map((b) => b.id)).toEqual([1]);
  });

  it('menangani batch besar (> ukuran chunk)', () => {
    const { db } = createTestDb();
    const upserts = Array.from({ length: 450 }, (_, i) => blk(i + 1));
    const p = page({ block: { upserts } }, 'v1');
    applyMasterChanges(db, p.changes, p.cursor);
    expect(countMaster(db).block).toBe(450);
  });
});
