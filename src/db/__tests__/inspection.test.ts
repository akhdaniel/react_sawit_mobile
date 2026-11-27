import { eq } from 'drizzle-orm';

import {
  canCorrectInspection,
  createFollowup,
  createInspection,
  inspectionFindings,
  inspectionScore,
  inspectionView,
  isSelfInspection,
  listOpenFindings,
  taksasiEstimate,
  templatesForRoles,
  validateFollowup,
  validateInspection,
  type FindingInput,
  type InspectionInput,
} from '@/db/repositories/inspection';
import { attendance, inspection, inspectionFinding, photo } from '@/db/schema';
import { createTestDb } from '@/test/db';
import { attendanceRow, inspectionItemIds, photoRow, seedInspectionMaster, seedMaster, txCommon, uuid } from '@/test/fixtures';

const MUTU_PANEN = 2;
const MUTU_RAWAT = 3;
const SENSUS = 4;
const TAKSASI = 1;
const MP = inspectionItemIds(MUTU_PANEN);

function setup() {
  const { db } = createTestDb();
  seedMaster(db);
  seedInspectionMaster(db);
  return db;
}

const mandor = { roles: ['mandor_panen'] as const, employeeId: 10 };
const kerani = { roles: ['kerani_panen'] as const, employeeId: 11 };

const line = (itemId: number, v: Partial<{ value_num: number; value_bool: boolean; value_text: string }> = {}) => ({
  item_id: itemId,
  value_num: null,
  value_bool: null,
  value_text: null,
  ...v,
});

function finding(over: Partial<FindingInput> = {}): FindingInput {
  return {
    findingUuid: uuid(),
    itemId: MP.BRD!,
    category: 'brondolan_tinggal',
    severity: 'major',
    description: 'Brondolan tidak dikutip',
    rowNo: 12,
    treeNo: 7,
    palmTreeQr: null,
    lat: 0.51,
    lng: 101.41,
    photoIds: [],
    ...over,
  };
}

function input(over: Partial<InspectionInput> = {}): InspectionInput {
  return {
    workDate: '2026-10-18',
    templateId: MUTU_PANEN,
    blockId: 1,
    tphId: null,
    harvesterEmployeeId: null,
    gangId: null,
    sampleSize: 10,
    lines: [],
    findings: [],
    taksasi: null,
    sensus: null,
    photoIds: [],
    ...over,
  };
}

const common = (over: Record<string, unknown> = {}) => ({ ...txCommon(), status: 'queued' as const, ...over });

describe('inspeksi: template & aturan', () => {
  it('template mengikuti peran HP; kerani panen hanya taksasi dan jenis umum', () => {
    const db = setup();
    const kerani = templatesForRoles(db, ['kerani_panen']).map((t) => t.inspectionType);
    expect(kerani).toContain('taksasi');
    expect(kerani).not.toContain('mutu_panen');
    expect(kerani).not.toContain('mutu_rawat');
    expect(templatesForRoles(db, ['inspektur'])).toHaveLength(7);
    expect(templatesForRoles(db, ['kerani_transport'])).toEqual([]);
  });

  it('input sah tanpa error; skor dihitung dengan rumus ERP', () => {
    const db = setup();
    const ok = input({ lines: [line(MP.BRD!, { value_num: 3 })], findings: [finding()] });
    expect(validateInspection(db, ok, mandor)).toEqual([]);
    expect(inspectionScore(db, MUTU_PANEN, ok.lines).scorePct).toBeCloseTo(600 / 7, 5);
  });

  it('menolak peran, item, isian, dan temuan yang tidak sesuai aturan server', () => {
    const db = setup();
    const rawat = inspectionItemIds(MUTU_RAWAT);
    const cases: [InspectionInput, typeof mandor | typeof kerani, string][] = [
      [input(), kerani, 'role_not_allowed'],
      [input(), { ...mandor, employeeId: null } as never, 'no_employee'],
      [input({ lines: [line(rawat.PRG!, { value_num: 4 })] }), mandor, 'item_not_in_template'],
      [input({ lines: [line(MP.BRD!, { value_num: 1 }), line(MP.BRD!, { value_num: 2 })] }), mandor, 'duplicate_item'],
      [input({ lines: [line(MP.BRD!, { value_num: 1.5 })] }), mandor, 'invalid_value'],
      [input({ templateId: MUTU_RAWAT, lines: [line(rawat.GWG!, { value_num: 4 })] }), { roles: ['mandor_rawat'], employeeId: 20 } as never, 'required_item_missing'],
      [input({ findings: [finding({ category: 'kebakaran' })] }), mandor, 'invalid_category'],
      [input({ tphId: 99 }), mandor, 'tph_block_mismatch'],
      [input({ harvesterEmployeeId: 11 }), mandor, 'no_check_in'],
      [input({ templateId: TAKSASI }), mandor, 'taksasi_required'],
      [input({ templateId: TAKSASI, taksasi: { sampled_trees: 3, ripe_bunches_counted: 40, harvest_date_target: '2026-10-19' } }), mandor, 'invalid_taksasi'],
      [input({ templateId: TAKSASI, blockId: 2, taksasi: { sampled_trees: 30, ripe_bunches_counted: 6, harvest_date_target: '2026-10-19' } }), mandor, 'block_without_productive_trees'],
      [input({ templateId: SENSUS, sensus: { tree_count_productive: 0, tree_count_sisipan: 0, tree_count_dead: 0, tree_count_abnormal: 0 } }), mandor, 'sensus_required'],
    ];
    for (const [i, user, code] of cases) expect(validateInspection(db, i, user)).toContain(code);
    // Server lama tidak mengirim employee_id: tidak dinilai di HP.
    expect(validateInspection(db, input(), { roles: ['mandor_panen'] })).toEqual([]);
  });

  it('pemanen mutu panen harus sudah hadir', () => {
    const db = setup();
    db.insert(attendance).values(attendanceRow({ employeeId: 11 })).run();
    expect(validateInspection(db, input({ harvesterEmployeeId: 11 }), mandor)).toEqual([]);
  });

  it('penilaian sendiri: mandor atau mandor pengganti kemandoran yang dinilai', () => {
    const db = setup();
    expect(isSelfInspection(db, { gangId: 1, harvesterEmployeeId: null }, 10)).toBe(true);
    // Pemanen 11 di kemandoran 1 (mandor 10).
    expect(isSelfInspection(db, { gangId: null, harvesterEmployeeId: 11 }, 10)).toBe(true);
    expect(isSelfInspection(db, { gangId: 2, harvesterEmployeeId: null }, 11)).toBe(true);
    expect(isSelfInspection(db, { gangId: 2, harvesterEmployeeId: null }, 10)).toBe(false);
    expect(isSelfInspection(db, { gangId: 1, harvesterEmployeeId: null }, null)).toBe(false);
  });

  it('estimasi taksasi dari pokok produktif dan BJR blok', () => {
    const db = setup();
    expect(taksasiEstimate(db, 1, { sampled_trees: 30, ripe_bunches_counted: 6 })).toEqual({ akpPct: 20, estBunches: 600, estKg: 600 * 18.5 });
  });
});

describe('inspeksi: simpan, koreksi, temuan terbuka', () => {
  it('menyimpan inspeksi + temuan atomik, foto ditautkan ke inspeksi', () => {
    const db = setup();
    const inspectionPhoto = photoRow();
    const findingPhoto = photoRow();
    db.insert(photo).values([inspectionPhoto, findingPhoto]).run();
    const c = common();
    const f = finding({ photoIds: [findingPhoto.id], palmTreeQr: '  QR-1 ' });
    createInspection(db, c, input({ lines: [line(MP.BRD!, { value_num: 3 })], findings: [f], photoIds: [inspectionPhoto.id] }));
    const row = db.select().from(inspection).get()!;
    expect([row.inspectionType, row.scorePct.toFixed(3), row.status]).toEqual(['mutu_panen', (600 / 7).toFixed(3), 'queued']);
    expect(inspectionFindings(db, c.mobileUuid).map((x) => [x.findingUuid, x.palmTreeQr])).toEqual([[f.findingUuid, 'QR-1']]);
    expect(db.select().from(photo).all().map((p) => p.transactionUuid)).toEqual([c.mobileUuid, c.mobileUuid]);
    expect(inspectionView(db, c.mobileUuid)).toMatchObject({ templateName: 'Mutu Panen (Ancak)', blockCode: 'A01', findingCount: 1, criticalCount: 0 });
  });

  it('template tidak dikenal membatalkan seluruh simpan', () => {
    const db = setup();
    expect(() => createInspection(db, common(), input({ templateId: 999, findings: [finding()] }))).toThrow();
    expect(db.select().from(inspectionFinding).all()).toEqual([]);
  });

  it('UUID temuan unik; koreksi boleh membawa ulang temuan inspeksi yang belum diposting', () => {
    const db = setup();
    const f = finding();
    const c = common();
    createInspection(db, c, input({ findings: [f] }));
    expect(validateInspection(db, input({ findings: [f] }), mandor)).toContain('duplicate_finding_uuid');
    expect(validateInspection(db, input({ findings: [f], correctionOf: c.mobileUuid }), mandor)).toEqual([]);
    expect(canCorrectInspection(db, c.mobileUuid)).toBe(true);
    createInspection(db, common(), input({ findings: [f], correctionOf: c.mobileUuid }));
    expect(canCorrectInspection(db, c.mobileUuid)).toBe(false);
  });

  it('temuan terkunci setelah inspeksinya terkirim (append-only)', () => {
    const db = setup();
    const c = common();
    createInspection(db, c, input({ findings: [finding()] }));
    db.update(inspection).set({ status: 'sent' }).where(eq(inspection.mobileUuid, c.mobileUuid)).run();
    expect(() => db.update(inspectionFinding).set({ description: 'ubah' }).run()).toThrow(/TX_APPEND_ONLY/);
    expect(() => db.insert(inspectionFinding).values({ ...finding(), findingUuid: uuid(), inspectionUuid: c.mobileUuid, category: 'hama', photoIds: [] } as never).run()).toThrow(
      /TX_APPEND_ONLY/,
    );
    expect(() => db.delete(inspectionFinding).run()).toThrow(/TX_APPEND_ONLY/);
  });

  it('temuan terbuka: master ERP afdeling pengguna + temuan HP belum diposting, kritis dulu', () => {
    const db = setup();
    const critical = finding({ severity: 'critical', category: 'hama' });
    createInspection(db, common(), input({ findings: [critical] }));
    const list = listOpenFindings(db, [1]);
    expect(list.map((f) => [f.ref, f.source, f.state, f.dueDate])).toEqual([
      [critical.findingUuid, 'local', 'pending', '2026-10-19'],
      ['id:900', 'server', 'open', '2026-10-25'],
    ]);
    // Afdeling lain tidak tampil.
    expect(listOpenFindings(db, [2]).map((f) => f.ref)).toEqual(['id:901']);
    // Setelah diterima server, hanya master yang berlaku: temuan yang sudah ditutup ERP tidak muncul lagi.
    db.update(inspection).set({ status: 'sent' }).run();
    db.update(inspection).set({ status: 'accepted' }).run();
    expect(listOpenFindings(db, [1]).map((f) => f.ref)).toEqual(['id:900']);
  });

  it('tindak lanjut: hanya peran lapangan tertentu, temuan harus dikenal; tercatat di daftar temuan', () => {
    const db = setup();
    const roleErr = validateFollowup(db, { findingRef: 'id:900', actionText: 'Bersihkan', done: true, photoIds: [] }, ['kerani_panen']);
    expect(roleErr).toEqual(['role_not_allowed']);
    expect(validateFollowup(db, { findingRef: 'id:12345', actionText: 'x', done: true, photoIds: [] }, ['mandor_panen'])).toEqual(['finding_not_found']);
    expect(validateFollowup(db, { findingRef: 'id:900', actionText: ' ', done: true, photoIds: [] }, ['inspektur'])).toEqual(['action_required']);

    const p = photoRow();
    db.insert(photo).values(p).run();
    const c = common();
    createFollowup(db, c, { findingRef: 'id:900', actionText: '  Bersihkan piringan ', done: false, photoIds: [p.id] });
    expect(db.select().from(photo).get()!.transactionUuid).toBe(c.mobileUuid);
    const f = listOpenFindings(db, [1]).find((x) => x.ref === 'id:900')!;
    expect(f.lastFollowup).toMatchObject({ done: false, status: 'queued' });

    // Temuan HP yang belum diposting bisa langsung ditindaklanjuti (server menunggu inspeksinya).
    const local = finding();
    createInspection(db, common(), input({ findings: [local] }));
    expect(validateFollowup(db, { findingRef: local.findingUuid, actionText: 'Kutip', done: true, photoIds: [] }, ['mandor_panen'])).toEqual([]);
  });
});
