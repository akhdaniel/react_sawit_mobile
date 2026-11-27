import { randomUUID } from 'node:crypto';

import type { fertilizationTicket, harvestTicket, maintenanceTicket } from '@/db/schema';

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

export function fertilizationTicketRow(overrides: Partial<typeof fertilizationTicket.$inferInsert> = {}) {
  return {
    ...txCommon(),
    workDate: '2026-10-18',
    blockId: 1,
    gangId: 2,
    workerEmployeeId: 11,
    productId: 30,
    method: 'manual' as const,
    treeCount: 100,
    qtyKg: 150,
    status: 'queued' as const,
    ...overrides,
  } satisfies typeof fertilizationTicket.$inferInsert;
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

export function maintenanceTicketRow(overrides: Partial<typeof maintenanceTicket.$inferInsert> = {}) {
  return {
    ...txCommon(),
    workDate: '2026-10-18',
    blockId: 1,
    gangId: 2,
    workerEmployeeId: 11,
    workType: 'semprot_gulma',
    areaHa: 1.5,
    treeCount: 0,
    hk: 1,
    materials: [{ product_id: 40, qty: 3 }],
    status: 'queued' as const,
    ...overrides,
  } satisfies typeof maintenanceTicket.$inferInsert;
}

// ---- Inspeksi ------------------------------------------------------------------
// Template & item bawaan ERP (data xerpium_plantation_inspection), sama dengan fixture test Odoo:
// 1 taksasi, 2 mutu panen (BRD 1, MTG 2, MTH 2, PLP 1, TGK 1), 3 mutu rawat (PRG 2, GWG 1, PPK 1 opsional),
// 4 sensus, 5 hama & penyakit, 6 infrastruktur (JLN 2, JMB 1 opsional, PRT 1), 7 umum.
export const INSPECTION_TEMPLATES = [
  { id: 1, code: 'TKS-STD', name: 'Taksasi Panen Besok', inspection_type: 'taksasi', sample_unit: 'pokok', default_sample_size: 30, pass_score_pct: 80, allowed_roles: ['inspektur', 'asisten', 'mandor_panen', 'kerani_panen'] },
  { id: 2, code: 'MP-STD', name: 'Mutu Panen (Ancak)', inspection_type: 'mutu_panen', sample_unit: 'ancak', default_sample_size: 10, pass_score_pct: 80, allowed_roles: ['inspektur', 'asisten', 'mandor_panen'] },
  { id: 3, code: 'MR-STD', name: 'Mutu Rawat', inspection_type: 'mutu_rawat', sample_unit: 'titik', default_sample_size: 5, pass_score_pct: 80, allowed_roles: ['inspektur', 'asisten', 'mandor_rawat'] },
  { id: 4, code: 'SNS-STD', name: 'Sensus Pokok', inspection_type: 'sensus', sample_unit: 'blok', default_sample_size: 1, pass_score_pct: 80, allowed_roles: ['inspektur', 'asisten', 'mandor_panen', 'mandor_rawat', 'kerani_panen', 'kerani_rawat'] },
  { id: 5, code: 'HP-STD', name: 'Hama & Penyakit', inspection_type: 'hama_penyakit', sample_unit: 'pokok', default_sample_size: 20, pass_score_pct: 80, allowed_roles: ['inspektur', 'asisten', 'mandor_panen', 'mandor_rawat', 'kerani_panen', 'kerani_rawat'] },
  { id: 6, code: 'INF-STD', name: 'Infrastruktur Kebun', inspection_type: 'infrastruktur', sample_unit: 'titik', default_sample_size: 1, pass_score_pct: 80, allowed_roles: ['inspektur', 'asisten', 'mandor_panen', 'mandor_rawat', 'kerani_panen', 'kerani_rawat'] },
  { id: 7, code: 'UMUM-STD', name: 'Inspeksi Umum', inspection_type: 'umum', sample_unit: 'titik', default_sample_size: 1, pass_score_pct: 80, allowed_roles: ['inspektur', 'asisten', 'mandor_panen', 'mandor_rawat', 'kerani_panen', 'kerani_rawat'] },
] as const;
export const INSPECTION_ITEMS = [
  { id: 1, template_id: 2, sequence: 10, code: 'BRD', name: 'Brondolan tidak dikutip di piringan', value_type: 'count', select_options: [], uom: 'butir', weight: 1, bad_when: 'gt', threshold: 0, threshold_text: null, finding_category: 'brondolan_tinggal', finding_severity: 'minor', required: true },
  { id: 2, template_id: 2, sequence: 20, code: 'MTG', name: 'Buah matang tidak dipanen', value_type: 'count', select_options: [], uom: 'janjang', weight: 2, bad_when: 'gt', threshold: 0, threshold_text: null, finding_category: 'buah_matang_tinggal', finding_severity: 'minor', required: true },
  { id: 3, template_id: 2, sequence: 30, code: 'MTH', name: 'Buah mentah dipanen', value_type: 'count', select_options: [], uom: 'janjang', weight: 2, bad_when: 'gt', threshold: 0, threshold_text: null, finding_category: 'buah_mentah_dipanen', finding_severity: 'minor', required: true },
  { id: 4, template_id: 2, sequence: 40, code: 'PLP', name: 'Pelepah tidak disusun di gawangan mati', value_type: 'bool', select_options: [], uom: null, weight: 1, bad_when: 'true', threshold: 0, threshold_text: null, finding_category: 'pelepah_tidak_disusun', finding_severity: 'minor', required: true },
  { id: 5, template_id: 2, sequence: 50, code: 'TGK', name: 'Tangkai panjang (lebih dari 2 cm)', value_type: 'count', select_options: [], uom: 'janjang', weight: 1, bad_when: 'gt', threshold: 0, threshold_text: null, finding_category: 'tangkai_panjang', finding_severity: 'minor', required: true },
  { id: 6, template_id: 3, sequence: 10, code: 'PRG', name: 'Kebersihan piringan', value_type: 'score_1_5', select_options: [], uom: null, weight: 2, bad_when: 'lt', threshold: 3, threshold_text: null, finding_category: 'piringan_kotor', finding_severity: 'minor', required: true },
  { id: 7, template_id: 3, sequence: 20, code: 'GWG', name: 'Kebersihan gawangan', value_type: 'score_1_5', select_options: [], uom: null, weight: 1, bad_when: 'lt', threshold: 3, threshold_text: null, finding_category: 'gawangan_kotor', finding_severity: 'minor', required: true },
  { id: 8, template_id: 3, sequence: 30, code: 'PPK', name: 'Pupuk tersebar merata di piringan', value_type: 'bool', select_options: [], uom: null, weight: 1, bad_when: 'false', threshold: 0, threshold_text: null, finding_category: 'pupuk_tidak_tepat', finding_severity: 'minor', required: false },
  { id: 9, template_id: 5, sequence: 10, code: 'ULT', name: 'Serangan ulat api / ulat kantong', value_type: 'select', select_options: ['Tidak ada', 'Ringan', 'Sedang', 'Berat'], uom: null, weight: 1, bad_when: 'in', threshold: 0, threshold_text: 'Sedang|Berat', finding_category: 'hama', finding_severity: 'major', required: true },
  { id: 10, template_id: 5, sequence: 20, code: 'TKS', name: 'Bekas serangan tikus baru', value_type: 'count', select_options: [], uom: 'pokok', weight: 1, bad_when: 'gt', threshold: 0, threshold_text: null, finding_category: 'hama', finding_severity: 'minor', required: true },
  { id: 11, template_id: 5, sequence: 30, code: 'GND', name: 'Gejala Ganoderma (busuk pangkal batang)', value_type: 'bool', select_options: [], uom: null, weight: 2, bad_when: 'true', threshold: 0, threshold_text: null, finding_category: 'penyakit', finding_severity: 'major', required: true },
  { id: 12, template_id: 6, sequence: 10, code: 'JLN', name: 'Kondisi jalan produksi', value_type: 'score_1_5', select_options: [], uom: null, weight: 2, bad_when: 'lt', threshold: 3, threshold_text: null, finding_category: 'infrastruktur_rusak', finding_severity: 'minor', required: true },
  { id: 13, template_id: 6, sequence: 20, code: 'JMB', name: 'Kondisi jembatan / titi panen', value_type: 'score_1_5', select_options: [], uom: null, weight: 1, bad_when: 'lt', threshold: 3, threshold_text: null, finding_category: 'infrastruktur_rusak', finding_severity: 'minor', required: false },
  { id: 14, template_id: 6, sequence: 30, code: 'PRT', name: 'Kondisi parit / drainase', value_type: 'score_1_5', select_options: [], uom: null, weight: 1, bad_when: 'lt', threshold: 3, threshold_text: null, finding_category: 'infrastruktur_rusak', finding_severity: 'minor', required: true },
  { id: 15, template_id: 7, sequence: 10, code: 'CAT', name: 'Catatan pengamatan', value_type: 'text', select_options: [], uom: null, weight: 0, bad_when: null, threshold: 0, threshold_text: null, finding_category: null, finding_severity: 'minor', required: false },
] as const;


/** Kode item → id item fixture untuk satu template. */
export function inspectionItemIds(templateId: number): Record<string, number> {
  return Object.fromEntries(INSPECTION_ITEMS.filter((i) => i.template_id === templateId).map((i) => [i.code, i.id]));
}

/**
 * Master inspeksi di atas seedMaster: template & item ERP, rincian pokok blok 1 (3.000 produktif, BJR 18,5),
 * gang 2 dengan mandor pengganti pekerja 11, dan satu temuan terbuka ERP di blok 1.
 */
export function seedInspectionMaster(db: import('@/db/types').AppDatabase) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { applyMasterChanges } = require('@/db/repositories/master') as typeof import('@/db/repositories/master');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { masterResponseSchema } = require('@/sync/contract') as typeof import('@/sync/contract');
  const page = masterResponseSchema.parse({
    cursor: 'v2',
    server_time: '2026-10-18T00:00:00.000Z',
    changes: {
      block: {
        upserts: [
          {
            id: 1, code: 'A01', afdeling_id: 1, ha: 30, planting_year: 2010, status: 'TM', bjr_kg: 18.5, polygon_geojson: null,
            tree_count: 3200, tree_count_productive: 3000, tree_count_sisipan: 150, tree_count_dead: 50,
          },
          { id: 2, code: 'B01', afdeling_id: 2, ha: 25, planting_year: 2012, status: 'TM', bjr_kg: 17, polygon_geojson: null },
        ],
      },
      gang: { upserts: [{ id: 2, name: 'Panen 2', foreman_employee_id: 20, acting_foreman_employee_id: 11, afdeling_id: 1 }] },
      inspection_template: { upserts: INSPECTION_TEMPLATES },
      inspection_item: { upserts: INSPECTION_ITEMS },
      open_finding: {
        upserts: [
          {
            id: 900, mobile_uuid: null, inspection_id: null, blok_id: 1, category: 'piringan_kotor', severity: 'minor',
            description: 'Piringan kotor baris 3', row_no: 3, tree_no: null, due_date: '2026-10-25', pic_employee_id: 10, state: 'open',
          },
          {
            id: 901, mobile_uuid: null, inspection_id: null, blok_id: 2, category: 'hama', severity: 'critical',
            description: 'Afdeling lain', row_no: null, tree_no: null, due_date: '2026-10-19', pic_employee_id: null, state: 'open',
          },
        ],
      },
    },
  });
  applyMasterChanges(db, page.changes, page.cursor);
}
