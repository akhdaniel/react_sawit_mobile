/**
 * Fixture identik dengan test Odoo xerpium_plantation_inspection (test_inspection, test_inspection_template,
 * test_inspection_taksasi_sensus): rumus HP harus menghasilkan skor yang sama dengan ERP.
 */
import {
  computeScore,
  computeTaksasi,
  defaultDueDate,
  isBad,
  lineError,
  taksasiValid,
  type CalcItem,
  type CalcLine,
} from '@/features/inspection/calc';
import { INSPECTION_ITEMS, INSPECTION_TEMPLATES } from '@/test/fixtures';

const items = (templateId: number): CalcItem[] =>
  INSPECTION_ITEMS.filter((i) => i.template_id === templateId).map((i) => ({
    id: i.id,
    valueType: i.value_type,
    weight: i.weight,
    badWhen: i.bad_when,
    threshold: i.threshold,
    thresholdText: i.threshold_text,
    selectOptions: [...i.select_options],
    required: i.required,
  }));

/** Isian per kode item, seperti helper _inspection test Odoo. */
function score(templateId: number, values: Record<string, number | boolean | string> = {}) {
  const its = items(templateId);
  const codes = Object.fromEntries(INSPECTION_ITEMS.filter((i) => i.template_id === templateId).map((i) => [i.code, i]));
  const lines: CalcLine[] = Object.entries(values).map(([code, v]) => {
    const it = codes[code]!;
    const line: CalcLine = { item_id: it.id, value_num: null, value_bool: null, value_text: null };
    if (it.value_type === 'bool') line.value_bool = v as boolean;
    else if (it.value_type === 'select' || it.value_type === 'text') line.value_text = v as string;
    else line.value_num = v as number;
    return line;
  });
  const pass = INSPECTION_TEMPLATES.find((t) => t.id === templateId)!.pass_score_pct;
  return computeScore(its, lines, pass);
}

const MUTU_PANEN = 2;
const MUTU_RAWAT = 3;
const HAMA = 5;
const INFRA = 6;
const TAKSASI = 1;

describe('skor inspeksi (sama dengan ERP)', () => {
  it('item biner: bobot mutu panen total 7', () => {
    const clean = score(MUTU_PANEN);
    expect([clean.scorePct, clean.result, clean.badCount]).toEqual([100, 'pass', 0]);
    const brondolan = score(MUTU_PANEN, { BRD: 3 });
    expect(brondolan.scorePct).toBeCloseTo(600 / 7, 5);
    expect([brondolan.result, brondolan.badCount]).toEqual(['pass', 1]);
    const poor = score(MUTU_PANEN, { BRD: 3, MTG: 2, PLP: true });
    expect(poor.scorePct).toBeCloseTo(300 / 7, 5);
    expect([poor.result, poor.badCount]).toEqual(['fail', 3]);
  });

  it('skor 1–5 bernilai sebagian', () => {
    // Piringan 5 (bobot 2) = 2, gawangan 3 (bobot 1) = 0.5, pupuk merata (bobot 1) = 1 → 3.5 / 4.
    const rawat = score(MUTU_RAWAT, { PRG: 5, GWG: 3, PPK: true });
    expect(rawat.scorePct).toBeCloseTo(87.5, 5);
    expect(rawat.badCount).toBe(0);
    const dirty = score(MUTU_RAWAT, { PRG: 2, GWG: 1, PPK: false });
    expect(dirty.badCount).toBe(3);
    expect(dirty.scorePct).toBeCloseTo((100 * 0.5) / 4, 5);
  });

  it('item opsional yang kosong tidak dinilai; item wajib kosong dilaporkan', () => {
    // Jembatan opsional dikosongkan: jalan 4 (bobot 2) = 1.5, parit 3 = 0.5 → 2 / 3.
    const infra = score(INFRA, { JLN: 4, PRT: 3 });
    expect(infra.scorePct).toBeCloseTo(200 / 3, 5);
    expect(infra.missingRequired).toEqual([]);
    expect(score(MUTU_RAWAT, { GWG: 4 }).missingRequired).toEqual([items(MUTU_RAWAT).find((i) => i.weight === 2)!.id]);
  });

  it('template tanpa item: skor 0 tanpa hasil', () => {
    const r = score(TAKSASI);
    expect([r.scorePct, r.result, r.lines]).toEqual([0, null, []]);
  });
});

describe('aturan buruk dan isian', () => {
  const item = (over: Partial<CalcItem>): CalcItem => ({
    id: 1,
    valueType: 'count',
    weight: 1,
    badWhen: null,
    threshold: 0,
    thresholdText: null,
    selectOptions: [],
    required: true,
    ...over,
  });
  const CNT = item({ valueType: 'count', badWhen: 'gt', threshold: 0 });
  const SCR = item({ valueType: 'score_1_5', badWhen: 'lt', threshold: 3 });
  const YES = item({ valueType: 'bool', badWhen: 'true' });
  const NO = item({ valueType: 'bool', badWhen: 'false' });
  const SEL = item({ valueType: 'select', badWhen: 'in', thresholdText: 'Sedang|Berat', selectOptions: ['Tidak ada', 'Ringan', 'Sedang', 'Berat'] });
  const TXT = item({ valueType: 'text', weight: 0 });

  it.each([
    ['CNT', CNT, 0, false],
    ['CNT', CNT, 2, true],
    ['CNT', CNT, null, false],
    ['SCR', SCR, 3, false],
    ['SCR', SCR, 2, true],
    ['YES', YES, true, true],
    ['YES', YES, false, false],
    ['NO', NO, false, true],
    ['NO', NO, true, false],
    ['SEL', SEL, 'Ringan', false],
    ['SEL', SEL, 'Berat', true],
    ['TXT', TXT, 'apa saja', false],
  ] as const)('%s %p → buruk %p', (_code, it, value, expected) => {
    expect(isBad(it, value)).toBe(expected);
  });

  it('isian tidak sesuai tipe ditolak', () => {
    const blank = { item_id: 1, value_num: null, value_bool: null, value_text: null };
    const hama = Object.fromEntries(items(HAMA).map((i) => [INSPECTION_ITEMS.find((x) => x.id === i.id)!.code, i]));
    expect(lineError(hama.ULT!, { ...blank, value_text: 'Parah' })).toBe('invalid_value');
    expect(lineError(hama.ULT!, { ...blank, value_text: ' Berat ' })).toBeNull();
    expect(lineError(hama.TKS!, { ...blank, value_num: -1 })).toBe('invalid_value');
    expect(lineError(hama.TKS!, { ...blank, value_num: 1.5 })).toBe('invalid_value');
    expect(lineError(SCR, { ...blank, value_num: 6 })).toBe('invalid_value');
  });
});

describe('taksasi dan temuan', () => {
  it('AKP 20% × 3.000 pokok = 600 janjang × 18 kg = 10.800 kg', () => {
    expect(computeTaksasi({ sampledTrees: 30, ripeBunchesCounted: 6, productiveTrees: 3000, bjrKg: 18 })).toEqual({
      akpPct: 20,
      estBunches: 600,
      estKg: 10800,
    });
    expect(computeTaksasi({ sampledTrees: 0, ripeBunchesCounted: 0, productiveTrees: 3000, bjrKg: 18 }).akpPct).toBe(0);
  });

  it('taksasi sah: pokok sampel > 0 dan janjang ≤ 10 per pokok', () => {
    expect(taksasiValid({ sampled_trees: 30, ripe_bunches_counted: 300 })).toBe(true);
    expect(taksasiValid({ sampled_trees: 3, ripe_bunches_counted: 40 })).toBe(false);
    expect(taksasiValid({ sampled_trees: 0, ripe_bunches_counted: 0 })).toBe(false);
  });

  it('jatuh tempo bawaan: kritis 1, mayor 3, minor 7 hari', () => {
    expect(defaultDueDate('2026-10-30', 'critical')).toBe('2026-10-31');
    expect(defaultDueDate('2026-10-30', 'major')).toBe('2026-11-02');
    expect(defaultDueDate('2026-10-30', 'minor')).toBe('2026-11-06');
  });
});
