/**
 * Inspeksi lapangan dan tindak lanjut temuan (struktur inspeksi ERP), dengan aturan yang sama dengan server
 * (xerpium_sawit_mobile_inspection):
 *
 * - Template hanya untuk peran yang ada di `allowed_roles`-nya; item checklist milik template, isian sesuai tipe,
 *   item wajib terisi; skor dihitung dengan rumus inspeksi ERP (features/inspection/calc).
 * - Taksasi wajib pokok sampel > 0 dan janjang matang ≤ 10 per pokok, blok punya pokok produktif; sensus wajib
 *   hitungan pokok; mutu panen per pemanen wajib pemanen sudah hadir.
 * - Temuan: kategori ERP, UUID unik; inspeksi + temuan disimpan atomik, foto ditautkan ke inspeksinya.
 * - Tindak lanjut hanya oleh mandor panen/rawat, asisten, atau inspektur; kerani hanya melihat temuan.
 * - Koreksi = inspeksi baru dengan correction_of; server membatalkan inspeksi asal saat koreksi diposting.
 */
import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';

import {
  computeScore,
  computeTaksasi,
  defaultDueDate,
  lineError,
  taksasiValid,
  type CalcItem,
  type ScoreResult,
  type TaksasiEstimate,
} from '../../features/inspection/calc';
import type { Role } from '../../sync/contract/api';
import { distanceM, geojsonCenter } from '../../lib/geo';
import { FINDING_CATEGORIES, type FindingSeverity, type InspectionType } from '../../sync/contract/master';
import {
  block,
  employee,
  gang,
  inspection,
  photo,
  inspectionFinding,
  inspectionFollowup,
  inspectionItem,
  inspectionTemplate,
  openFinding,
  tph,
  type InspectionLine,
  type InspectionSensus,
  type InspectionTaksasi,
} from '../schema';
import type { AppDatabase } from '../types';
import { presentEmployeeIds } from './attendance';
import { insertPhoto, linkPhoto, type NewPhoto } from './photos';

export type InspectionRow = typeof inspection.$inferSelect;
export type NewInspection = typeof inspection.$inferInsert;
export type InspectionFindingRow = typeof inspectionFinding.$inferSelect;
export type InspectionFollowupRow = typeof inspectionFollowup.$inferSelect;
export type NewInspectionFollowup = typeof inspectionFollowup.$inferInsert;
export type InspectionTemplateRow = typeof inspectionTemplate.$inferSelect;
export type InspectionItemRow = typeof inspectionItem.$inferSelect;

/** Peran yang boleh menindaklanjuti temuan dari HP. */
export const FOLLOWUP_ROLES: readonly Role[] = ['mandor_panen', 'mandor_rawat', 'asisten', 'inspektur'];

export type InspectionErrorCode =
  | 'unknown_template'
  | 'unknown_block'
  | 'tph_block_mismatch'
  | 'role_not_allowed'
  | 'no_employee'
  | 'item_not_in_template'
  | 'duplicate_item'
  | 'invalid_value'
  | 'required_item_missing'
  | 'taksasi_required'
  | 'invalid_taksasi'
  | 'block_without_productive_trees'
  | 'sensus_required'
  | 'no_check_in'
  | 'invalid_category'
  | 'invalid_finding'
  | 'duplicate_finding_uuid'
  | 'correction_target_invalid';

export type FollowupErrorCode = 'role_not_allowed' | 'finding_not_found' | 'action_required';

/** Pengguna yang membuat inspeksi: peran HP dan karyawannya (undefined = server lama tidak mengirimnya). */
export interface InspectionUser {
  roles: readonly Role[];
  employeeId?: number | null;
}

export interface FindingInput {
  findingUuid: string;
  itemId: number | null;
  category: string;
  severity: FindingSeverity;
  description: string;
  rowNo: number | null;
  treeNo: number | null;
  palmTreeQr: string | null;
  lat: number | null;
  lng: number | null;
  photoIds: string[];
}

export interface InspectionInput {
  workDate: string;
  templateId: number;
  blockId: number;
  tphId: number | null;
  harvesterEmployeeId: number | null;
  gangId: number | null;
  sampleSize: number;
  lines: InspectionLine[];
  findings: FindingInput[];
  taksasi: InspectionTaksasi | null;
  sensus: InspectionSensus | null;
  photoIds: string[];
  correctionOf?: string | null;
}

export interface FollowupInput {
  findingRef: string;
  actionText: string;
  done: boolean;
  photoIds: string[];
  correctionOf?: string | null;
}

// ---- Template & item --------------------------------------------------------

/** Template yang boleh dipakai salah satu peran pengguna, urut jenis lalu nama. */
export function templatesForRoles(db: AppDatabase, roles: readonly Role[]): InspectionTemplateRow[] {
  return db
    .select()
    .from(inspectionTemplate)
    .orderBy(inspectionTemplate.inspectionType, inspectionTemplate.name)
    .all()
    .filter((t) => t.allowedRoles.some((r) => roles.includes(r as Role)));
}

export function templateItems(db: AppDatabase, templateId: number): InspectionItemRow[] {
  return db
    .select()
    .from(inspectionItem)
    .where(eq(inspectionItem.templateId, templateId))
    .orderBy(inspectionItem.sequence, inspectionItem.id)
    .all();
}

const toCalcItem = (i: InspectionItemRow): CalcItem => ({
  id: i.id,
  valueType: i.valueType,
  weight: i.weight,
  badWhen: i.badWhen,
  threshold: i.threshold,
  thresholdText: i.thresholdText,
  selectOptions: i.selectOptions,
  required: i.required,
});

/** Skor checklist dengan rumus inspeksi ERP (0 bila template tidak dikenal). */
export function inspectionScore(db: AppDatabase, templateId: number, lines: readonly InspectionLine[]): ScoreResult {
  const template = db.select().from(inspectionTemplate).where(eq(inspectionTemplate.id, templateId)).get();
  return computeScore(templateItems(db, templateId).map(toCalcItem), lines, template?.passScorePct ?? 0);
}

/** Estimasi panen besok dari taksasi: pokok produktif dan BJR dari master blok. */
export function taksasiEstimate(
  db: AppDatabase,
  blockId: number,
  t: Pick<InspectionTaksasi, 'sampled_trees' | 'ripe_bunches_counted'>,
): TaksasiEstimate {
  const b = db.select({ productive: block.treeCountProductive, bjr: block.bjrKg }).from(block).where(eq(block.id, blockId)).get();
  return computeTaksasi({
    sampledTrees: t.sampled_trees,
    ripeBunchesCounted: t.ripe_bunches_counted,
    productiveTrees: b?.productive ?? 0,
    bjrKg: b?.bjr ?? 0,
  });
}

/**
 * Penilaian sendiri: pembuat adalah mandor (atau mandor pengganti) kemandoran yang dinilai — kemandoran yang
 * dipilih, atau kemandoran pemanen pada mutu panen. Sama dengan penanda self_inspection server.
 */
export function isSelfInspection(
  db: AppDatabase,
  input: Pick<InspectionInput, 'gangId' | 'harvesterEmployeeId'>,
  employeeId: number | null | undefined,
): boolean {
  if (!employeeId) return false;
  const gangId =
    input.gangId ??
    (input.harvesterEmployeeId
      ? (db.select({ g: employee.gangId }).from(employee).where(eq(employee.id, input.harvesterEmployeeId)).get()?.g ?? null)
      : null);
  if (!gangId) return false;
  const g = db.select().from(gang).where(eq(gang.id, gangId)).get();
  return !!g && (g.foremanEmployeeId === employeeId || g.actingForemanEmployeeId === employeeId);
}

export interface InspectionBlock {
  id: number;
  code: string;
  status: 'TM' | 'TBM';
  plantingYear: number | null;
  /** Jarak ke posisi HP (meter); null bila lokasi/batas blok tidak diketahui. */
  distanceM: number | null;
}

/** Blok afdeling pengguna, terdekat dulu (titik tengah batas blok, atau rata-rata TPH), lalu kode. */
export function inspectionBlocks(db: AppDatabase, afdelingIds: readonly number[], here: { lat: number; lng: number } | null): InspectionBlock[] {
  if (afdelingIds.length === 0) return [];
  const blocks = db.select().from(block).where(inArray(block.afdelingId, [...afdelingIds])).all();
  const tphs = db.select().from(tph).where(inArray(tph.blockId, blocks.map((b) => b.id))).all();
  const center = (b: (typeof blocks)[number]) => {
    const polygon = geojsonCenter(b.polygonGeojson);
    if (polygon) return polygon;
    const pts = tphs.filter((x) => x.blockId === b.id && x.lat != null && x.lng != null);
    return pts.length ? { lat: pts.reduce((s, x) => s + x.lat!, 0) / pts.length, lng: pts.reduce((s, x) => s + x.lng!, 0) / pts.length } : null;
  };
  return blocks
    .map((b) => {
      const c = here ? center(b) : null;
      return { id: b.id, code: b.code, status: b.status, plantingYear: b.plantingYear, distanceM: c && here ? distanceM(here, c) : null };
    })
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || a.code.localeCompare(b.code));
}

// ---- Inspeksi ---------------------------------------------------------------

/** Inspeksi efektif: tidak ditolak dan tidak digantikan koreksi. */
export function effectiveInspections(db: AppDatabase, workDate?: string): InspectionRow[] {
  const conds = [ne(inspection.status, 'rejected')];
  if (workDate) conds.push(eq(inspection.workDate, workDate));
  const rows = db.select().from(inspection).where(and(...conds)).orderBy(desc(inspection.createdTrustedAt)).all();
  const superseded = new Set(rows.map((r) => r.correctionOf).filter((x): x is string => !!x));
  return rows.filter((r) => !superseded.has(r.mobileUuid));
}

function findingUuidTaken(db: AppDatabase, findingUuid: string, correctionOf: string | null | undefined): boolean {
  if (db.select({ id: openFinding.id }).from(openFinding).where(eq(openFinding.mobileUuid, findingUuid)).get()) return true;
  const local = db
    .select({ inspectionUuid: inspectionFinding.inspectionUuid, status: inspection.status })
    .from(inspectionFinding)
    .innerJoin(inspection, eq(inspection.mobileUuid, inspectionFinding.inspectionUuid))
    .where(eq(inspectionFinding.findingUuid, findingUuid))
    .all();
  // Koreksi boleh membawa ulang temuan dari inspeksi yang dikoreksi selama inspeksi itu belum diposting.
  return local.some((r) => r.status !== 'rejected' && !(r.inspectionUuid === correctionOf && r.status !== 'posted'));
}

export function validateInspection(db: AppDatabase, input: InspectionInput, user: InspectionUser): InspectionErrorCode[] {
  const issues: InspectionErrorCode[] = [];
  const template = db.select().from(inspectionTemplate).where(eq(inspectionTemplate.id, input.templateId)).get();
  const b = db.select().from(block).where(eq(block.id, input.blockId)).get();
  if (!template) issues.push('unknown_template');
  if (!b) issues.push('unknown_block');
  if (input.tphId != null && db.select().from(tph).where(eq(tph.id, input.tphId)).get()?.blockId !== input.blockId) {
    issues.push('tph_block_mismatch');
  }
  if (template && !template.allowedRoles.some((r) => user.roles.includes(r as Role))) issues.push('role_not_allowed');
  if (user.employeeId === null) issues.push('no_employee');

  const items = template ? templateItems(db, template.id).map(toCalcItem) : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<number>();
  for (const line of input.lines) {
    const item = byId.get(line.item_id);
    if (!item) {
      issues.push('item_not_in_template');
      continue;
    }
    if (seen.has(item.id)) issues.push('duplicate_item');
    seen.add(item.id);
    if (lineError(item, line)) issues.push('invalid_value');
  }
  if (template && computeScore(items, input.lines, template.passScorePct).missingRequired.length) issues.push('required_item_missing');

  const type = template?.inspectionType;
  if (type === 'taksasi') {
    if (!input.taksasi) issues.push('taksasi_required');
    else if (!taksasiValid(input.taksasi)) issues.push('invalid_taksasi');
    if (b && !(b.treeCountProductive && b.treeCountProductive > 0)) issues.push('block_without_productive_trees');
  }
  if (type === 'sensus') {
    const s = input.sensus;
    if (!s || !(s.tree_count_productive + s.tree_count_sisipan + s.tree_count_dead + s.tree_count_abnormal)) {
      issues.push('sensus_required');
    }
  }
  if (type === 'mutu_panen' && input.harvesterEmployeeId != null && !presentEmployeeIds(db, input.workDate).has(input.harvesterEmployeeId)) {
    issues.push('no_check_in');
  }

  const categories: readonly string[] = FINDING_CATEGORIES;
  const uuids = input.findings.map((f) => f.findingUuid);
  if (new Set(uuids).size !== uuids.length) issues.push('duplicate_finding_uuid');
  for (const f of input.findings) {
    if (!categories.includes(f.category)) issues.push('invalid_category');
    if (!f.description.trim()) issues.push('invalid_finding');
    if (f.itemId != null && !byId.has(f.itemId)) issues.push('item_not_in_template');
    if (findingUuidTaken(db, f.findingUuid, input.correctionOf)) issues.push('duplicate_finding_uuid');
  }

  if (input.correctionOf && !canCorrectInspection(db, input.correctionOf)) issues.push('correction_target_invalid');
  return [...new Set(issues)];
}

/** Inspeksi boleh dikoreksi bila ada dan belum punya koreksi yang tidak ditolak. */
export function canCorrectInspection(db: AppDatabase, mobileUuid: string): boolean {
  if (!db.select({ u: inspection.mobileUuid }).from(inspection).where(eq(inspection.mobileUuid, mobileUuid)).get()) return false;
  const existing = db
    .select({ u: inspection.mobileUuid })
    .from(inspection)
    .where(and(eq(inspection.correctionOf, mobileUuid), ne(inspection.status, 'rejected')))
    .get();
  return !existing;
}

/**
 * Simpan inspeksi + temuan dalam satu transaksi DB; skor dihitung di sini dengan rumus ERP. Foto inspeksi dan
 * foto temuan (`photos` = foto baru dari kamera, disisipkan di transaksi yang sama) ditautkan ke inspeksi
 * (diunggah dengan transaction_uuid inspeksi, seperti di server).
 */
export function createInspection(
  db: AppDatabase,
  common: Omit<NewInspection, keyof InspectionInput | 'inspectionType' | 'scorePct'>,
  input: InspectionInput,
  photos: readonly NewPhoto[] = [],
): string {
  db.transaction((tx) => {
    const t = tx as unknown as AppDatabase;
    for (const p of photos) insertPhoto(t, p);
    const template = t.select().from(inspectionTemplate).where(eq(inspectionTemplate.id, input.templateId)).get();
    if (!template) throw new Error('Template inspeksi tidak dikenal');
    t.insert(inspection)
      .values({
        ...common,
        correctionOf: input.correctionOf ?? null,
        workDate: input.workDate,
        inspectionType: template.inspectionType,
        templateId: input.templateId,
        blockId: input.blockId,
        tphId: input.tphId,
        harvesterEmployeeId: input.harvesterEmployeeId,
        gangId: input.gangId,
        sampleSize: input.sampleSize,
        lines: input.lines,
        taksasi: template.inspectionType === 'taksasi' ? input.taksasi : null,
        sensus: template.inspectionType === 'sensus' ? input.sensus : null,
        scorePct: inspectionScore(t, input.templateId, input.lines).scorePct,
        photoIds: input.photoIds,
      })
      .run();
    for (const f of input.findings) {
      t.insert(inspectionFinding)
        .values({
          findingUuid: f.findingUuid,
          inspectionUuid: common.mobileUuid,
          itemId: f.itemId,
          category: f.category,
          severity: f.severity,
          description: f.description.trim(),
          rowNo: f.rowNo,
          treeNo: f.treeNo,
          palmTreeQr: f.palmTreeQr?.trim() || null,
          lat: f.lat,
          lng: f.lng,
          photoIds: f.photoIds,
        })
        .run();
    }
    for (const photoId of [...input.photoIds, ...input.findings.flatMap((f) => f.photoIds)]) linkPhoto(t, photoId, common.mobileUuid);
  });
  return common.mobileUuid;
}

export function inspectionFindings(db: AppDatabase, inspectionUuid: string): InspectionFindingRow[] {
  return db.select().from(inspectionFinding).where(eq(inspectionFinding.inspectionUuid, inspectionUuid)).all();
}

export interface InspectionView extends InspectionRow {
  templateName: string;
  blockCode: string;
  findingCount: number;
  criticalCount: number;
}

export function inspectionViews(db: AppDatabase, workDate: string, type?: InspectionType): InspectionView[] {
  return decorate(db, effectiveInspections(db, workDate).filter((r) => !type || r.inspectionType === type));
}

export function inspectionView(db: AppDatabase, mobileUuid: string): InspectionView | null {
  const row = db.select().from(inspection).where(eq(inspection.mobileUuid, mobileUuid)).get();
  return row ? (decorate(db, [row])[0] ?? null) : null;
}

function decorate(db: AppDatabase, rows: InspectionRow[]): InspectionView[] {
  if (rows.length === 0) return [];
  const uuids = rows.map((r) => r.mobileUuid);
  const templates = new Map(
    db.select().from(inspectionTemplate).where(inArray(inspectionTemplate.id, rows.map((r) => r.templateId))).all().map((x) => [x.id, x]),
  );
  const blocks = new Map(db.select().from(block).where(inArray(block.id, rows.map((r) => r.blockId))).all().map((x) => [x.id, x]));
  const findings = db.select().from(inspectionFinding).where(inArray(inspectionFinding.inspectionUuid, uuids)).all();
  return rows.map((r) => {
    const own = findings.filter((f) => f.inspectionUuid === r.mobileUuid);
    return {
      ...r,
      templateName: templates.get(r.templateId)?.name ?? `#${r.templateId}`,
      blockCode: blocks.get(r.blockId)?.code ?? `#${r.blockId}`,
      findingCount: own.length,
      criticalCount: own.filter((f) => f.severity === 'critical').length,
    };
  });
}

// ---- Temuan terbuka & tindak lanjut -------------------------------------------

export interface OpenFindingView {
  /** Rujukan untuk tindak lanjut: finding_uuid temuan HP, atau `id:<id ERP>`. */
  ref: string;
  source: 'server' | 'local';
  serverId: number | null;
  findingUuid: string | null;
  blokId: number;
  blockCode: string;
  category: string;
  severity: FindingSeverity;
  description: string;
  rowNo: number | null;
  treeNo: number | null;
  dueDate: string | null;
  /** Status ERP; `pending` = temuan HP yang belum diterima server. */
  state: 'open' | 'in_progress' | 'pending';
  /** Tindak lanjut terakhir dari HP ini (yang belum ditolak). */
  lastFollowup: { done: boolean; status: InspectionFollowupRow['status']; createdTrustedAt: string } | null;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2 };

/**
 * Temuan yang masih perlu ditindaklanjuti di afdeling pengguna: master temuan terbuka ERP ditambah temuan dari
 * inspeksi di HP ini yang belum diterima server. Urut kritis dulu, lalu jatuh tempo.
 */
export function listOpenFindings(db: AppDatabase, afdelingIds: readonly number[]): OpenFindingView[] {
  const blocks = new Map(
    db
      .select()
      .from(block)
      .where(inArray(block.afdelingId, [...afdelingIds]))
      .all()
      .map((b) => [b.id, b]),
  );
  const out: OpenFindingView[] = [];
  const known = new Set<string>();
  for (const f of db.select().from(openFinding).all()) {
    const b = blocks.get(f.blokId);
    if (!b) continue;
    if (f.mobileUuid) known.add(f.mobileUuid);
    out.push({
      ref: f.mobileUuid ?? `id:${f.id}`,
      source: 'server',
      serverId: f.id,
      findingUuid: f.mobileUuid,
      blokId: f.blokId,
      blockCode: b.code,
      category: f.category,
      severity: f.severity,
      description: f.description,
      rowNo: f.rowNo,
      treeNo: f.treeNo,
      dueDate: f.dueDate,
      state: f.state,
      lastFollowup: null,
    });
  }
  // Temuan HP yang belum diterima server. Sesudah diterima, master temuan terbuka jadi satu-satunya sumber:
  // temuan yang ditutup/dibatalkan di ERP hilang dari master dan tidak boleh muncul lagi dari salinan lokal.
  const pending = effectiveInspections(db).filter((i) => ['draft', 'queued', 'sent'].includes(i.status) && blocks.has(i.blockId));
  for (const i of pending) {
    for (const f of inspectionFindings(db, i.mobileUuid)) {
      if (known.has(f.findingUuid)) continue;
      out.push({
        ref: f.findingUuid,
        source: 'local',
        serverId: null,
        findingUuid: f.findingUuid,
        blokId: i.blockId,
        blockCode: blocks.get(i.blockId)!.code,
        category: f.category,
        severity: f.severity,
        description: f.description,
        rowNo: f.rowNo,
        treeNo: f.treeNo,
        dueDate: defaultDueDate(i.workDate, f.severity),
        state: 'pending',
        lastFollowup: null,
      });
    }
  }
  const followups = effectiveFollowups(db);
  for (const v of out) {
    const refs = findingRefs(v);
    const last = followups.find((x) => refs.includes(x.findingRef));
    if (last) v.lastFollowup = { done: last.done, status: last.status, createdTrustedAt: last.createdTrustedAt };
  }
  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  );
}

/** Tindak lanjut efektif (tidak ditolak, tidak digantikan koreksi), terbaru dulu. */
export function effectiveFollowups(db: AppDatabase): InspectionFollowupRow[] {
  const rows = db
    .select()
    .from(inspectionFollowup)
    .where(ne(inspectionFollowup.status, 'rejected'))
    .orderBy(desc(inspectionFollowup.createdTrustedAt))
    .all();
  const superseded = new Set(rows.map((r) => r.correctionOf).filter((x): x is string => !!x));
  return rows.filter((r) => !superseded.has(r.mobileUuid));
}

/** Rujukan sebuah temuan: finding_uuid (temuan HP) dan/atau `id:<id ERP>` — tindak lanjut bisa memakai salah satunya. */
function findingRefs(f: Pick<OpenFindingView, 'ref' | 'serverId' | 'findingUuid'>): string[] {
  return [...new Set([f.ref, f.findingUuid, f.serverId != null ? `id:${f.serverId}` : null].filter((x): x is string => !!x))];
}

export interface FollowupView extends InspectionFollowupRow {
  /** URI lokal foto tindak lanjut di HP. */
  photoUris: string[];
}

/** Riwayat tindak lanjut sebuah temuan dari HP ini (yang tidak ditolak/digantikan koreksi), terbaru dulu. */
export function findingFollowups(db: AppDatabase, f: Pick<OpenFindingView, 'ref' | 'serverId' | 'findingUuid'>): FollowupView[] {
  const refs = findingRefs(f);
  const rows = effectiveFollowups(db).filter((x) => refs.includes(x.findingRef));
  if (rows.length === 0) return [];
  const photos = db
    .select({ tx: photo.transactionUuid, uri: photo.localUri })
    .from(photo)
    .where(and(isNotNull(photo.transactionUuid), inArray(photo.transactionUuid, rows.map((r) => r.mobileUuid))))
    .all();
  return rows.map((r) => ({ ...r, photoUris: photos.filter((p) => p.tx === r.mobileUuid).map((p) => p.uri) }));
}

function findingKnown(db: AppDatabase, ref: string): boolean {
  if (ref.startsWith('id:')) {
    const id = Number(ref.slice(3));
    return !!db.select({ id: openFinding.id }).from(openFinding).where(eq(openFinding.id, id)).get();
  }
  if (db.select({ id: openFinding.id }).from(openFinding).where(eq(openFinding.mobileUuid, ref)).get()) return true;
  const local = db
    .select({ status: inspection.status, uuid: inspection.mobileUuid })
    .from(inspectionFinding)
    .innerJoin(inspection, eq(inspection.mobileUuid, inspectionFinding.inspectionUuid))
    .where(eq(inspectionFinding.findingUuid, ref))
    .get();
  return !!local && local.status !== 'rejected' && effectiveInspections(db).some((i) => i.mobileUuid === local.uuid);
}

export function validateFollowup(db: AppDatabase, input: FollowupInput, roles: readonly Role[]): FollowupErrorCode[] {
  const issues: FollowupErrorCode[] = [];
  if (!FOLLOWUP_ROLES.some((r) => roles.includes(r))) issues.push('role_not_allowed');
  if (!findingKnown(db, input.findingRef)) issues.push('finding_not_found');
  if (!input.actionText.trim()) issues.push('action_required');
  return issues;
}

export function createFollowup(
  db: AppDatabase,
  common: Omit<NewInspectionFollowup, keyof FollowupInput>,
  input: FollowupInput,
  photos: readonly NewPhoto[] = [],
): string {
  db.transaction((tx) => {
    const t = tx as unknown as AppDatabase;
    for (const p of photos) insertPhoto(t, p);
    t.insert(inspectionFollowup)
      .values({
        ...common,
        correctionOf: input.correctionOf ?? null,
        findingRef: input.findingRef,
        actionText: input.actionText.trim(),
        done: input.done,
        photoIds: input.photoIds,
      })
      .run();
    for (const photoId of input.photoIds) linkPhoto(t, photoId, common.mobileUuid);
  });
  return common.mobileUuid;
}
