import { randomUUID } from 'node:crypto';

import type { harvestTicket } from '@/db/schema';

export const uuid = () => randomUUID();

export function txCommon(overrides: Record<string, unknown> = {}) {
  return {
    mobileUuid: uuid(),
    userId: 7,
    deviceId: 'dev-test-001',
    createdTrustedAt: '2026-10-18T01:00:00.000Z',
    deviceTimeAt: '2026-10-18T01:00:05.000Z',
    timeSource: 'server' as const,
    lat: 0.51,
    lng: 101.45,
    accuracyM: 8,
    mocked: false,
    rooted: false,
    ...overrides,
  };
}

export function harvestTicketRow(overrides: Partial<typeof harvestTicket.$inferInsert> = {}) {
  return {
    ...txCommon(),
    workDate: '2026-10-18',
    ticketNo: `AFD01-261018-AB12-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`,
    tphId: 1,
    blockId: 1,
    harvesterEmployeeId: 10,
    ripe: 20,
    unripe: 1,
    rotten: 0,
    estKg: 21 * 18.5,
    status: 'queued' as const,
    ...overrides,
  } satisfies typeof harvestTicket.$inferInsert;
}

export function attendanceRow(overrides: Record<string, unknown> = {}) {
  return {
    ...txCommon(),
    workDate: '2026-10-18',
    employeeId: 10,
    gangId: 1,
    type: 'check_in' as const,
    attStatus: 'hadir' as const,
    status: 'queued' as const,
    ...overrides,
  };
}

export function photoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    localUri: 'file:///data/photo.jpg',
    sha256: 'a'.repeat(64),
    sizeBytes: 1234,
    takenTrustedAt: '2026-10-18T01:00:00.000Z',
    ...overrides,
  };
}

/** Master minimal: 1 afdeling (polygon persegi), 2 gang, 4 pekerja (1 nonaktif), blok, kegiatan, rencana kerja. */
export function seedMaster(db: import('@/db/types').AppDatabase, workDate = '2026-10-18') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { applyMasterChanges } = require('@/db/repositories/master') as typeof import('@/db/repositories/master');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { masterResponseSchema } = require('@/sync/contract') as typeof import('@/sync/contract');
  const square = { type: 'Polygon', coordinates: [[[101.4, 0.5], [101.43, 0.5], [101.43, 0.55], [101.4, 0.55], [101.4, 0.5]]] };
  const page = masterResponseSchema.parse({
    cursor: 'v1',
    server_time: '2026-10-18T00:00:00.000Z',
    changes: {
      afdeling: { upserts: [{ id: 1, code: 'AFD01', name: 'Afdeling I', estate_id: 1, polygon_geojson: square }] },
      gang: { upserts: [{ id: 1, name: 'Panen 1', foreman_employee_id: 10, afdeling_id: 1 }, { id: 2, name: 'Panen 2', foreman_employee_id: 20, afdeling_id: 1 }] },
      employee: {
        upserts: [
          { id: 10, nik: '1401001', name: 'Agus', type: 'SKU', gang_id: 1, active: true },
          { id: 11, nik: '1401002', name: 'Budi', type: 'BHL', gang_id: 1, active: true },
          { id: 12, nik: '1401003', name: 'Cici', type: 'SKU', gang_id: 1, active: false },
          { id: 20, nik: '1401004', name: 'Dedi', type: 'SKU', gang_id: 2, active: true },
        ],
      },
      block: { upserts: [{ id: 1, code: 'A01', afdeling_id: 1, ha: 30, planting_year: 2010, status: 'TM', bjr_kg: 18.5, polygon_geojson: null }] },
      activity: { upserts: [{ id: 1, code: 'PN01', name: 'Panen', kind: 'harvest', wage_basis: 'per_bunch', rate: 2500 }] },
      work_plan: { upserts: [{ id: 1, date: workDate, afdeling_id: 1, block_id: 1, activity_id: 1, gang_id: 1, target_ha: 10, target_bunch: 500 }] },
    },
  });
  applyMasterChanges(db, page.changes, page.cursor);
}
