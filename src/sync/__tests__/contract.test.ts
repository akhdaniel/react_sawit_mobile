import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { z } from 'zod';

import { MASTER_ENTITIES, masterTables, TRANSACTION_TYPES, transactionTables } from '@/db/schema';
import {
  MASTER_ENTITY_NAMES,
  masterSchemas,
  TX_TYPE_NAMES,
  transactionsRequestSchema,
  txMetaSchema,
  txPayloadSchemas,
  type TxItem,
} from '@/sync/contract';
import { uuid } from '@/test/fixtures';

const columnNames = (t: SQLiteTable) => Object.values(getTableColumns(t)).map((c) => c.name).sort();
const shapeKeys = (s: z.ZodType) => {
  const def = (s as unknown as { shape?: Record<string, unknown>; def: { in?: { shape: Record<string, unknown> } } });
  // .refine() di zod v4 tetap ZodObject; .shape tersedia langsung.
  return Object.keys(def.shape ?? def.def.in?.shape ?? {}).sort();
};

describe('paritas kontrak API ↔ skema SQLite', () => {
  it('entitas master sama', () => {
    expect([...MASTER_ENTITY_NAMES].sort()).toEqual([...MASTER_ENTITIES].sort());
  });

  it.each(MASTER_ENTITIES)('kolom master %s = field API', (entity) => {
    expect(shapeKeys(masterSchemas[entity])).toEqual(columnNames(masterTables[entity]));
  });

  it('tipe transaksi sama', () => {
    expect([...TX_TYPE_NAMES].sort()).toEqual([...TRANSACTION_TYPES].sort());
  });

  it.each(TRANSACTION_TYPES)('kolom transaksi %s tercakup payload + meta', (type) => {
    const statusCols = ['mobile_uuid', 'status', 'reject_reason', 'server_id', 'sent_at', 'posted_at'];
    const covered = new Set([...shapeKeys(txPayloadSchemas[type]), ...shapeKeys(txMetaSchema), ...statusCols]);
    const missing = columnNames(transactionTables[type]).filter((c) => !covered.has(c));
    expect(missing).toEqual([]);
  });
});

const meta = {
  user_id: 7,
  device_id: 'dev-1',
  created_trusted_at: '2026-10-18T01:00:00.000Z',
  device_time_at: '2026-10-18T01:00:03.000+07:00',
  time_source: 'server',
  lat: 0.5,
  lng: 101.4,
  accuracy_m: 6,
  mocked: false,
  rooted: false,
  correction_of: null,
};

const ticket = (over: Record<string, unknown> = {}): TxItem =>
  ({
    type: 'harvest_ticket',
    mobile_uuid: uuid(),
    meta,
    payload: {
      work_date: '2026-10-18',
      ticket_no: 'AFD01-261018-AB12-0001',
      tph_id: 1, block_id: 1, harvester_employee_id: 10,
      ripe: 20, unripe: 0, rotten: 0, empty_bunch: 0, long_stalk: 0, loose_fruit_kg: 3,
      est_kg: 370, photo_id: null, is_late_entry: false,
      ...over,
    },
  }) as TxItem;

describe('validasi transaksi', () => {
  it('menerima tiket panen valid', () => {
    expect(transactionsRequestSchema.safeParse({ items: [ticket()] }).success).toBe(true);
  });

  it('menolak nomor tiket salah format dan janjang negatif', () => {
    expect(transactionsRequestSchema.safeParse({ items: [ticket({ ticket_no: 'X-1' })] }).success).toBe(false);
    expect(transactionsRequestSchema.safeParse({ items: [ticket({ ripe: -1 })] }).success).toBe(false);
  });

  it('batch maksimal 500', () => {
    const items = Array.from({ length: 501 }, () => ticket());
    expect(transactionsRequestSchema.safeParse({ items }).success).toBe(false);
  });

  it('SPB wajib minimal 2 foto', () => {
    const r = txPayloadSchemas.spb.safeParse({
      work_date: '2026-10-18', spb_no: 'AFD01-261018-AB12-0001', vehicle_id: 1, driver_name: 'Budi',
      destination: 'internal_mill', parent_spb_uuid: null, total_bunch: 10, est_kg: 185,
      photo_ids: [uuid()], harvest_ticket_uuids: [uuid()],
    });
    expect(r.success).toBe(false);
  });

  it('over_dose wajib catatan', () => {
    const base = { upkeep_uuid: uuid(), product_id: 1, qty: 10, uom: 'kg', over_dose: true, approval_note: null };
    expect(txPayloadSchemas.material_usage.safeParse(base).success).toBe(false);
    expect(txPayloadSchemas.material_usage.safeParse({ ...base, approval_note: 'serangan hama' }).success).toBe(true);
  });

  it('terlambat wajib alasan; penugasan di luar rencana wajib alasan', () => {
    const att = { work_date: '2026-10-18', employee_id: 1, gang_id: 1, type: 'check_in', att_status: 'terlambat', late_reason: null, photo_id: null, outside_afdeling: false };
    expect(txPayloadSchemas.attendance.safeParse(att).success).toBe(false);
    const asg = { work_date: '2026-10-18', work_plan_id: null, unplanned_reason: ' ', activity_id: 1, block_id: 1, employee_ids: [1] };
    expect(txPayloadSchemas.assignment.safeParse(asg).success).toBe(false);
  });
});
