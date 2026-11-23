import { eq } from 'drizzle-orm';

import { collectOutbox } from '@/db/repositories/outbox';
import {
  latestConfirmFor,
  pendingFertilizationVerifications,
  pendingMaintenanceVerifications,
  pendingVerificationCount,
  pendingVerifications,
  replaceVerificationQueue,
} from '@/db/repositories/verification';
import { fertilizationTicket, harvestTicket, maintenanceTicket, stageConfirm } from '@/db/schema';
import type { TxContext } from '@/features/common/tx-factory';
import { continueQueued, continueTicket } from '@/features/harvest/stage';
import type { FertilizationVerificationItem, MaintenanceVerificationItem, VerificationItem } from '@/sync/contract';
import { createTestDb } from '@/test/db';
import { fertilizationTicketRow, harvestTicketRow, maintenanceTicketRow, uuid } from '@/test/fixtures';

jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const ctx: TxContext = {
  userId: 101,
  deviceId: 'and-x',
  trusted: { ms: 0, iso: '2026-10-18T02:00:00.000Z', source: 'server', reason: null, anchorAgeMs: 0, deviceSkewMs: 0 },
  deviceNowIso: '2026-10-18T02:00:01.000Z',
  fix: null,
  rooted: false,
} as unknown as TxContext;

const queued = (core_ticket_id: number, mobile_uuid: string | null = null): VerificationItem => ({
  core_ticket_id,
  name: `AU1-261018-K3ZQ-000${core_ticket_id}`,
  work_date: '2026-10-18',
  stage: 'Draft',
  block_code: 'B1',
  tph_code: 'TPH-01',
  sub_blok_name: null,
  harvester_id: 7,
  harvester_name: 'Pemanen',
  gang_name: null,
  ripe: 20,
  unripe: 0,
  rotten: 0,
  empty_bunch: 0,
  long_stalk: 0,
  loose_fruit_kg: 2.5,
  is_late_entry: false,
  has_photo: false,
  mobile_uuid,
  created_by: 'Kerani',
});

const fertilizationQueued = (core_ticket_id: number, mobile_uuid: string | null = null): FertilizationVerificationItem => ({
  core_ticket_id,
  name: `PPK/2026/${core_ticket_id}`,
  work_date: '2026-10-18',
  stage: 'Verifikasi Mandor',
  block_code: 'B1',
  sub_blok_name: null,
  worker_id: 11,
  worker_name: 'Pekerja Rawat',
  gang_name: 'Rawat 1',
  fertilizer_name: 'Urea',
  method: 'manual',
  application_round: 1,
  tree_count: 100,
  qty_kg: 150,
  mobile_uuid,
  created_by: 'Mandor Rawat',
});

const maintenanceQueued = (core_ticket_id: number): MaintenanceVerificationItem => ({
  core_ticket_id,
  name: `PRW/2026/${core_ticket_id}`,
  work_date: '2026-10-18',
  stage: 'Draft',
  block_code: 'B1',
  sub_blok_name: null,
  worker_id: 11,
  worker_name: 'Pekerja Rawat',
  gang_name: 'Rawat 1',
  work_type: 'semprot_gulma',
  area_ha: 1.5,
  tree_count: 0,
  hk: 1,
  materials: [{ name: 'Glifosat', qty: 3, uom: 'L' }],
  mobile_uuid: null,
  created_by: 'Kerani Rawat',
});

const queue = (
  items: VerificationItem[],
  fertilization_items: FertilizationVerificationItem[] = [],
  maintenance_items: MaintenanceVerificationItem[] = [],
) => ({ items, fertilization_items, maintenance_items });

describe('Lanjutkan tiket dari HP ini', () => {
  it('menyimpan stage_confirm yang dikirim sesudah tiketnya', () => {
    const { db } = createTestDb();
    const ticket = harvestTicketRow({ status: 'queued' });
    db.insert(harvestTicket).values(ticket).run();
    const r = continueTicket(db, ctx, ticket.mobileUuid);
    expect(r.ok).toBe(true);
    const { entries, invalid } = collectOutbox(db, 50, '1.0.0');
    expect(invalid).toEqual([]);
    expect(entries.map((e) => e.type)).toEqual(['harvest_ticket', 'stage_confirm']);
    expect(entries[1]!.item.payload).toEqual({ target_type: 'harvest_ticket', target_uuid: ticket.mobileUuid, core_ticket_id: null });
  });

  it('hanya sekali, kecuali Lanjutkan sebelumnya ditolak server', () => {
    const { db } = createTestDb();
    const ticket = harvestTicketRow({ status: 'posted' });
    db.insert(harvestTicket).values(ticket).run();
    const first = continueTicket(db, ctx, ticket.mobileUuid);
    expect(continueTicket(db, ctx, ticket.mobileUuid)).toEqual({ ok: false, code: 'already_continued' });
    if (!first.ok) throw new Error('harus berhasil');
    db.update(stageConfirm).set({ status: 'sent' }).where(eq(stageConfirm.mobileUuid, first.mobileUuid)).run();
    db.update(stageConfirm).set({ status: 'rejected', rejectReason: 'same_verifier' }).where(eq(stageConfirm.mobileUuid, first.mobileUuid)).run();
    expect(latestConfirmFor(db, ticket.mobileUuid)?.status).toBe('rejected');
    expect(continueTicket(db, ctx, ticket.mobileUuid).ok).toBe(true);
  });

  it('tiket ditolak atau sudah dikoreksi tidak bisa dilanjutkan', () => {
    const { db } = createTestDb();
    const rejected = harvestTicketRow({ status: 'rejected', ticketNo: 'AU1-261018-K3ZQ-0001' });
    const original = harvestTicketRow({ status: 'posted', ticketNo: 'AU1-261018-K3ZQ-0002' });
    db.insert(harvestTicket).values([rejected, original]).run();
    db.insert(harvestTicket).values(harvestTicketRow({ ticketNo: 'AU1-261018-K3ZQ-0003', correctionOf: original.mobileUuid })).run();
    expect(continueTicket(db, ctx, rejected.mobileUuid)).toEqual({ ok: false, code: 'ticket_rejected' });
    expect(continueTicket(db, ctx, original.mobileUuid)).toEqual({ ok: false, code: 'ticket_corrected' });
    expect(continueTicket(db, ctx, uuid())).toEqual({ ok: false, code: 'unknown_target' });
  });
});

describe('antrean verifikasi', () => {
  it('Lanjutkan dari antrean merujuk tiket ERP dan menghapusnya dari antrean', () => {
    const { db } = createTestDb();
    replaceVerificationQueue(db, queue([queued(1), queued(2)]), '2026-10-18T03:00:00.000Z');
    expect(continueQueued(db, ctx, 3)).toEqual({ ok: false, code: 'unknown_target' });
    expect(continueQueued(db, ctx, 1).ok).toBe(true);
    expect(continueQueued(db, ctx, 1)).toEqual({ ok: false, code: 'already_continued' });
    expect(pendingVerifications(db).map((v) => v.coreTicketId)).toEqual([2]);
    const { entries } = collectOutbox(db, 50, '1.0.0');
    expect(entries[0]!.item.payload).toEqual({ target_type: 'harvest_ticket', target_uuid: null, core_ticket_id: 1 });
  });

  it('tiket HP ini yang sudah dilanjutkan dari detail tiket tidak muncul lagi', () => {
    const { db } = createTestDb();
    const ticket = harvestTicketRow({ status: 'posted' });
    db.insert(harvestTicket).values(ticket).run();
    replaceVerificationQueue(db, queue([queued(1, ticket.mobileUuid)]), '2026-10-18T03:00:00.000Z');
    continueTicket(db, ctx, ticket.mobileUuid);
    expect(pendingVerifications(db)).toEqual([]);
  });
});

describe('Lanjutkan tiket pemupukan', () => {
  it('Simpan & Lanjutkan: stage_confirm pemupukan dikirim sesudah tiketnya', () => {
    const { db } = createTestDb();
    const ticket = fertilizationTicketRow();
    db.insert(fertilizationTicket).values(ticket).run();
    expect(continueTicket(db, ctx, ticket.mobileUuid, 'fertilization_ticket').ok).toBe(true);
    expect(continueTicket(db, ctx, ticket.mobileUuid, 'fertilization_ticket')).toEqual({ ok: false, code: 'already_continued' });
    // Tiket pemupukan bukan tiket panen: uuid-nya tidak dikenal sebagai tiket panen.
    expect(continueTicket(db, ctx, ticket.mobileUuid)).toEqual({ ok: false, code: 'unknown_target' });
    const { entries, invalid } = collectOutbox(db, 50, '1.0.0');
    expect(invalid).toEqual([]);
    expect(entries.map((e) => e.type)).toEqual(['fertilization_ticket', 'stage_confirm']);
    expect(entries[1]!.item.payload).toEqual({ target_type: 'fertilization_ticket', target_uuid: ticket.mobileUuid, core_ticket_id: null });
  });

  it('tiket pemupukan yang sudah dikoreksi tidak bisa dilanjutkan', () => {
    const { db } = createTestDb();
    const original = fertilizationTicketRow({ status: 'posted' });
    db.insert(fertilizationTicket).values(original).run();
    db.insert(fertilizationTicket).values(fertilizationTicketRow({ correctionOf: original.mobileUuid })).run();
    expect(continueTicket(db, ctx, original.mobileUuid, 'fertilization_ticket')).toEqual({ ok: false, code: 'ticket_corrected' });
  });

  it('antrean panen, pemupukan, dan perawatan terpisah walau id tiket ERP sama', () => {
    const { db } = createTestDb();
    replaceVerificationQueue(
      db,
      queue([queued(1)], [fertilizationQueued(1), fertilizationQueued(2)], [maintenanceQueued(1)]),
      '2026-10-18T03:00:00.000Z',
    );
    expect(pendingVerificationCount(db)).toBe(4);
    expect(continueQueued(db, ctx, 1, 'fertilization_ticket').ok).toBe(true);
    expect(pendingVerifications(db).map((v) => v.coreTicketId)).toEqual([1]);
    expect(pendingFertilizationVerifications(db).map((v) => v.coreTicketId)).toEqual([2]);
    expect(continueQueued(db, ctx, 1)).toEqual({ ok: true, mobileUuid: expect.any(String) });
    expect(continueQueued(db, ctx, 3, 'fertilization_ticket')).toEqual({ ok: false, code: 'unknown_target' });
    expect(pendingMaintenanceVerifications(db).map((v) => [v.coreTicketId, v.materials])).toEqual([
      [1, [{ name: 'Glifosat', qty: 3, uom: 'L' }]],
    ]);
    expect(continueQueued(db, ctx, 1, 'maintenance_ticket').ok).toBe(true);
    expect(pendingVerificationCount(db)).toBe(1);
    const { entries } = collectOutbox(db, 50, '1.0.0');
    expect(entries.map((e) => e.item.payload)).toEqual([
      { target_type: 'fertilization_ticket', target_uuid: null, core_ticket_id: 1 },
      { target_type: 'harvest_ticket', target_uuid: null, core_ticket_id: 1 },
      { target_type: 'maintenance_ticket', target_uuid: null, core_ticket_id: 1 },
    ]);
  });
});

describe('Lanjutkan tiket perawatan', () => {
  it('Simpan & Lanjutkan: stage_confirm perawatan dikirim sesudah tiketnya', () => {
    const { db } = createTestDb();
    const ticket = maintenanceTicketRow();
    db.insert(maintenanceTicket).values(ticket).run();
    expect(continueTicket(db, ctx, ticket.mobileUuid, 'maintenance_ticket').ok).toBe(true);
    expect(continueTicket(db, ctx, ticket.mobileUuid, 'fertilization_ticket')).toEqual({ ok: false, code: 'unknown_target' });
    const { entries, invalid } = collectOutbox(db, 50, '1.0.0');
    expect(invalid).toEqual([]);
    expect(entries.map((e) => e.type)).toEqual(['maintenance_ticket', 'stage_confirm']);
    expect(entries[1]!.item.payload).toEqual({ target_type: 'maintenance_ticket', target_uuid: ticket.mobileUuid, core_ticket_id: null });
  });
});
