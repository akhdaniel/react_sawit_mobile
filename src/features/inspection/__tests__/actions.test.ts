import { buildTxItem } from '@/db/repositories/outbox';
import { inspection, inspectionFinding, inspectionFollowup, photo } from '@/db/schema';
import type { TxContext } from '@/features/common/tx-factory';
import { saveFollowup, saveInspection } from '@/features/inspection/actions';
import { createTestDb } from '@/test/db';
import { inspectionItemIds, seedInspectionMaster, seedMaster } from '@/test/fixtures';

jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const D = '2026-10-18';
const ctx: TxContext = {
  userId: 101,
  deviceId: 'and-x',
  trusted: { ms: 0, iso: '2026-10-18T02:00:00.000Z', source: 'server', reason: null, anchorAgeMs: 0, deviceSkewMs: 0 } as never,
  deviceNowIso: '2026-10-18T02:00:01.000Z',
  fix: { lat: 0.51, lng: 101.41, accuracyM: 4, mocked: false, timestampMs: 0, source: 'current' },
  rooted: false,
};
const shot = (id: string) => ({ id, localUri: `file:///${id}.jpg`, sizeBytes: 1, sha256: 'e'.repeat(64), quality: 0.6, maxEdge: 1280 });
const PHOTO_A = '0b0f4a6e-1b2c-4d3e-8f4a-5b6c7d8e9f01';
const PHOTO_B = '0b0f4a6e-1b2c-4d3e-8f4a-5b6c7d8e9f02';

function setup() {
  const { db } = createTestDb();
  seedMaster(db, D);
  seedInspectionMaster(db);
  return db;
}

it('menyimpan inspeksi, temuan, dan foto kamera atomik; item kontrak sah untuk dikirim', () => {
  const db = setup();
  const brd = inspectionItemIds(2).BRD!;
  const findingUuid = 'a1f0c1de-0000-4000-8000-000000000001';
  const r = saveInspection(
    db,
    ctx,
    {
      workDate: D,
      templateId: 2,
      blockId: 1,
      tphId: null,
      harvesterEmployeeId: null,
      gangId: 1,
      sampleSize: 10,
      lines: [{ item_id: brd, value_num: 2, value_bool: null, value_text: null }],
      findings: [
        {
          findingUuid,
          itemId: brd,
          category: 'brondolan_tinggal',
          severity: 'major',
          description: 'Brondolan: 2 butir',
          rowNo: 3,
          treeNo: null,
          palmTreeQr: null,
          lat: 0.51,
          lng: 101.41,
          photoIds: [PHOTO_B],
        },
      ],
      taksasi: null,
      sensus: null,
      photoIds: [PHOTO_A],
    },
    { roles: ['mandor_panen'], employeeId: 10 },
    [shot(PHOTO_A), shot(PHOTO_B)],
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const row = db.select().from(inspection).get()!;
  expect(row).toMatchObject({ mobileUuid: r.mobileUuid, status: 'queued', lat: 0.51, timeSource: 'server' });
  expect(db.select().from(inspectionFinding).get()?.findingUuid).toBe(findingUuid);
  expect(db.select().from(photo).all().map((p) => [p.id, p.transactionUuid])).toEqual([
    [PHOTO_A, r.mobileUuid],
    [PHOTO_B, r.mobileUuid],
  ]);
  const built = buildTxItem(db, 'inspection', row as never, '1.0.0');
  expect(built.ok).toBe(true);
});

it('aturan gagal: tidak ada yang tersimpan, termasuk foto', () => {
  const db = setup();
  const r = saveInspection(
    db,
    ctx,
    { workDate: D, templateId: 2, blockId: 1, tphId: null, harvesterEmployeeId: null, gangId: null, sampleSize: 1, lines: [], findings: [], taksasi: null, sensus: null, photoIds: [PHOTO_A] },
    { roles: ['kerani_panen'], employeeId: 11 },
    [shot(PHOTO_A)],
  );
  expect(r).toEqual({ ok: false, issues: ['role_not_allowed'] });
  expect(db.select().from(inspection).all()).toEqual([]);
  expect(db.select().from(photo).all()).toEqual([]);
});

it('tindak lanjut temuan ERP dengan foto; kerani ditolak', () => {
  const db = setup();
  expect(saveFollowup(db, ctx, { findingRef: 'id:900', actionText: 'Bersihkan', done: true, photoIds: [] }, ['kerani_panen'], [])).toEqual({
    ok: false,
    issues: ['role_not_allowed'],
  });
  const r = saveFollowup(db, ctx, { findingRef: 'id:900', actionText: 'Bersihkan piringan', done: true, photoIds: [PHOTO_A] }, ['mandor_panen'], [shot(PHOTO_A)]);
  expect(r.ok).toBe(true);
  expect(db.select().from(inspectionFollowup).get()).toMatchObject({ findingRef: 'id:900', done: true, status: 'queued' });
  expect(db.select().from(photo).get()?.transactionUuid).toBe(r.ok ? r.mobileUuid : null);
});
