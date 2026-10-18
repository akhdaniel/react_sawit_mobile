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
