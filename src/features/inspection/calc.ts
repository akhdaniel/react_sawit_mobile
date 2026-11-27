/**
 * Kalkulasi inspeksi (murni), cermin model inspeksi ERP (xerpium_plantation_inspection) dan aturan server
 * (xerpium_sawit_mobile_inspection). Dipakai HP dan mock server, jadi hanya bergantung pada kontrak.
 *
 * - Isian "buruk" mengikuti aturan item (lebih/kurang dari batas, Ya/Tidak, pilihan termasuk daftar buruk).
 * - Skor = bobot item yang tidak buruk ÷ total bobot item terisi; skor 1–5 bernilai sebagian (1 = 0, 5 = penuh).
 *   Jumlah/angka dan Ya/Tidak selalu dianggap terisi; skor, pilihan, dan teks harus diisi. Teks tidak dinilai.
 * - Taksasi: AKP = janjang matang ÷ pokok sampel × 100; estimasi janjang = AKP × pokok produktif blok; kg = × BJR.
 */
import type { FindingSeverity, InspectionValueType } from '../../sync/contract/master';

export interface CalcItem {
  id: number;
  valueType: InspectionValueType;
  weight: number;
  badWhen: 'gt' | 'lt' | 'true' | 'false' | 'in' | null;
  threshold: number;
  thresholdText: string | null;
  selectOptions: string[];
  required: boolean;
}

/** Isian satu item (bentuk kontrak API). */
export interface CalcLine {
  item_id: number;
  value_num: number | null;
  value_bool: boolean | null;
  value_text: string | null;
}

export type LineValue = number | boolean | string | null;

const SCORED_VALUE_TYPES: readonly InspectionValueType[] = ['count', 'number', 'bool', 'score_1_5', 'select'];
/** Batas wajar janjang matang per pokok sampel saat taksasi. */
export const MAX_RIPE_PER_TREE = 10;
/** Selisih skor HP dan server yang masih diterima. */
export const SCORE_TOLERANCE = 0.5;
/** Jatuh tempo tindak lanjut bawaan temuan (hari sejak temuan), sama dengan ERP. */
export const DUE_DAYS: Readonly<Record<FindingSeverity, number>> = { critical: 1, major: 3, minor: 7 };

export function splitOptions(text: string | null | undefined): string[] {
  return (text ?? '')
    .split('|')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Nilai isian sesuai tipe item; null = belum diisi (skor 0 dan teks kosong juga belum diisi). */
export function lineValue(item: Pick<CalcItem, 'valueType'>, line: CalcLine | undefined): LineValue {
  switch (item.valueType) {
    case 'bool':
      return line?.value_bool ?? false;
    case 'score_1_5':
      return line?.value_num || null;
    case 'count':
    case 'number':
      return line?.value_num ?? 0;
    default:
      return line?.value_text?.trim() || null;
  }
}

export function isAnswered(item: Pick<CalcItem, 'valueType'>, value: LineValue): boolean {
  return item.valueType === 'count' || item.valueType === 'number' || item.valueType === 'bool' || value != null;
}

/** Apakah isian dianggap buruk menurut aturan item. Isian kosong tidak dinilai. */
export function isBad(item: Pick<CalcItem, 'valueType' | 'badWhen' | 'threshold' | 'thresholdText'>, value: LineValue): boolean {
  if (!item.badWhen || value == null || (value === false && item.valueType !== 'bool')) return false;
  switch (item.badWhen) {
    case 'gt':
      return Number(value) > item.threshold;
    case 'lt':
      return Number(value) < item.threshold;
    case 'true':
      return !!value;
    case 'false':
      return !value;
    case 'in':
      return splitOptions(item.thresholdText).includes(String(value).trim());
  }
}

/** Isian tidak sesuai tipe item (jumlah bulat ≥ 0, skor 1–5, pilihan dari daftar). */
export function lineError(item: CalcItem, line: CalcLine): 'invalid_value' | null {
  const num = line.value_num;
  const text = line.value_text?.trim() ?? '';
  if (item.valueType === 'count' && num != null && (num < 0 || !Number.isInteger(num))) return 'invalid_value';
  if (item.valueType === 'score_1_5' && num && ![1, 2, 3, 4, 5].includes(num)) return 'invalid_value';
  if (item.valueType === 'select' && text && !item.selectOptions.includes(text)) return 'invalid_value';
  return null;
}

export interface LineResult {
  itemId: number;
  value: LineValue;
  answered: boolean;
  bad: boolean;
  weightedScore: number;
}

export interface ScoreResult {
  /** 0 bila template tanpa item berbobot yang terisi (mis. taksasi, sensus). */
  scorePct: number;
  /** null bila tidak ada item berbobot yang terisi. */
  result: 'pass' | 'fail' | null;
  badCount: number;
  lines: LineResult[];
  /** Item wajib yang belum diisi. */
  missingRequired: number[];
}

export function computeScore(items: readonly CalcItem[], lines: readonly CalcLine[], passScorePct: number): ScoreResult {
  const byItem = new Map(lines.map((l) => [l.item_id, l]));
  const results = items.map((item): LineResult => {
    const value = lineValue(item, byItem.get(item.id));
    const answered = isAnswered(item, value);
    const bad = answered && isBad(item, value);
    let weightedScore = 0;
    if (answered && SCORED_VALUE_TYPES.includes(item.valueType)) {
      weightedScore = item.valueType === 'score_1_5' ? (item.weight * (Number(value) - 1)) / 4 : bad ? 0 : item.weight;
    }
    return { itemId: item.id, value, answered, bad, weightedScore };
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  const scored = results.filter((r) => {
    const item = itemById.get(r.itemId)!;
    return item.weight && SCORED_VALUE_TYPES.includes(item.valueType) && r.answered;
  });
  const total = scored.reduce((s, r) => s + itemById.get(r.itemId)!.weight, 0);
  const scorePct = total ? (100 * scored.reduce((s, r) => s + r.weightedScore, 0)) / total : 0;
  return {
    scorePct,
    result: total ? (scorePct >= passScorePct ? 'pass' : 'fail') : null,
    badCount: results.filter((r) => r.bad).length,
    lines: results,
    missingRequired: items.filter((i, idx) => i.required && !results[idx]!.answered).map((i) => i.id),
  };
}

export interface TaksasiEstimate {
  akpPct: number;
  estBunches: number;
  estKg: number;
}

export function computeTaksasi(input: {
  sampledTrees: number;
  ripeBunchesCounted: number;
  productiveTrees: number;
  bjrKg: number;
}): TaksasiEstimate {
  const akpPct = input.sampledTrees ? (100 * input.ripeBunchesCounted) / input.sampledTrees : 0;
  const estBunches = (akpPct * input.productiveTrees) / 100;
  return { akpPct, estBunches, estKg: estBunches * input.bjrKg };
}

/** Taksasi sah: ada pokok sampel dan janjang matang wajar (≤ 10 per pokok). */
export function taksasiValid(t: { sampled_trees: number; ripe_bunches_counted: number }): boolean {
  return t.sampled_trees > 0 && t.ripe_bunches_counted <= t.sampled_trees * MAX_RIPE_PER_TREE;
}

/** Tanggal jatuh tempo bawaan temuan (YYYY-MM-DD). */
export function defaultDueDate(findingDate: string, severity: FindingSeverity): string {
  const d = new Date(`${findingDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DUE_DAYS[severity]);
  return d.toISOString().slice(0, 10);
}

