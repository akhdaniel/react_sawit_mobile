import { EMPTY_COUNTS, estKg, findRate, formatRupiah, premiEstimate, totalBunches, totalsByTph, type HarvestRate } from '@/features/harvest/calc';
import { encodeTicketQr, parseTicketQr } from '@/features/harvest/qr';

const rate = (over: Partial<HarvestRate> = {}): HarvestRate => ({
  id: 1,
  estateId: null,
  employeeType: null,
  dateFrom: '2026-01-01',
  dateTo: null,
  lines: [
    { grade: 'ripe', line_type: 'premium', basis: 'per_bunch', scope: 'all', amount: 2500 },
    { grade: 'unripe', line_type: 'penalty', basis: 'per_bunch', scope: 'all', amount: 5000 },
    { grade: 'long_stalk', line_type: 'penalty', basis: 'per_bunch', scope: 'all', amount: 1000 },
  ],
  ...over,
});

describe('kalkulasi panen', () => {
  it('est_kg = (matang + mentah + busuk) × BJR', () => {
    const c = { ...EMPTY_COUNTS, ripe: 20, unripe: 2, rotten: 1, emptyBunch: 5 };
    expect(totalBunches(c)).toBe(23);
    expect(estKg(c, 18.5)).toBe(425.5);
    expect(estKg(c, 0)).toBe(0);
  });

  it('premi per janjang dari tarif ERP: matang dibayar, mentah & tangkai panjang didenda', () => {
    const r = premiEstimate({ ...EMPTY_COUNTS, ripe: 40, unripe: 2, longStalk: 3 }, 18.5, rate(), null);
    expect(r).toMatchObject({ hasRate: true, premium: 100000, penalty: 13000, net: 87000 });
    expect(r.lines.map((l) => [l.grade, l.unit, l.quantity, l.subtotal])).toEqual([
      ['ripe', 'bunch', 40, 100000],
      ['unripe', 'bunch', 2, -10000],
      ['long_stalk', 'bunch', 3, -3000],
    ]);
  });

  it('tanpa tarif: premi 0 dan ditandai', () => {
    expect(premiEstimate({ ...EMPTY_COUNTS, ripe: 5 }, 18.5, null, null)).toEqual({ hasRate: false, premium: 0, penalty: 0, net: 0, lines: [] });
  });

  it('pemilihan tarif sama dengan ERP: estate & tipe karyawan spesifik, lalu tanggal mulai terbaru, dalam masa berlaku', () => {
    const rates = [
      rate({ id: 1 }),
      rate({ id: 2, estateId: 1 }),
      rate({ id: 3, estateId: 1, employeeType: 'daily_worker' }),
      rate({ id: 4, estateId: 1, employeeType: 'daily_worker', dateFrom: '2026-06-01', dateTo: '2026-06-30' }),
      rate({ id: 5, estateId: 2, employeeType: 'daily_worker' }),
    ];
    const pick = (workDate: string, estateId: number | null, employeeType: string | null) => findRate(rates, { workDate, estateId, employeeType })?.id;
    expect(pick('2026-06-15', 1, 'daily_worker')).toBe(4);
    expect(pick('2026-07-01', 1, 'daily_worker')).toBe(3);
    expect(pick('2026-07-01', 1, 'employee')).toBe(2);
    expect(pick('2026-07-01', 9, null)).toBe(1);
    expect(pick('2025-12-31', 1, 'daily_worker')).toBeUndefined();
  });

  it('format rupiah', () => {
    expect(formatRupiah(87000)).toMatch(/^Rp 87[.,]000$/);
  });
});

describe('QR tiket', () => {
  const t = {
    uuid: '6f1c2a3b-4d5e-4f60-8a1b-2c3d4e5f6a7b',
    ticketNo: 'AFD01-261018-AB12-0007',
    blockCode: 'A01',
    tphCode: 'A01-T2',
    bunches: 23,
    estKg: 425.5,
    workDate: '2026-10-18',
    looseFruitKg: 3.5,
  };
  it('encode → parse bolak-balik', () => {
    const raw = encodeTicketQr(t);
    expect(raw.startsWith('XSM1|HT|')).toBe(true);
    expect(parseTicketQr(raw)).toEqual(t);
  });
  it('menolak QR asing / rusak', () => {
    expect(parseTicketQr('https://example.com')).toBeNull();
    expect(parseTicketQr('XSM1|HT|bukan-uuid|x|A|B|1|2|2026-10-18')).toBeNull();
    expect(parseTicketQr(encodeTicketQr(t).replace('|23|', '|-1|'))).toBeNull();
  });
  it('QR versi lama (tanpa brondolan) tetap terbaca, brondolan tidak diketahui', () => {
    const old = encodeTicketQr(t).replace(/\|3\.5$/, '');
    expect(parseTicketQr(old)).toEqual({ ...t, looseFruitKg: null });
  });
});

describe('rekap per TPH', () => {
  const tk = (tphId: number, tphCode: string, harvester: number, ripe: number, transported: boolean, extra: Partial<typeof EMPTY_COUNTS> = {}) => ({
    ...EMPTY_COUNTS, ...extra, ripe, tphId, tphCode, blockCode: 'A01', harvesterEmployeeId: harvester, estKg: estKg({ ...EMPTY_COUNTS, ...extra, ripe }, 18.5), transported,
  });

  it('menjumlahkan janjang, brondolan, kg, dan pemanen unik per TPH', () => {
    const r = totalsByTph([
      tk(2, 'TPH-10', 10, 20, true, { unripe: 1, looseFruitKg: 2.5 }),
      tk(1, 'TPH-2', 10, 5, false),
      tk(2, 'TPH-10', 11, 10, false, { looseFruitKg: 1.25 }),
      tk(2, 'TPH-10', 10, 4, false),
    ]);
    expect(r.map((x) => x.tphCode)).toEqual(['TPH-2', 'TPH-10']);
    expect(r[1]).toEqual({
      tphId: 2, tphCode: 'TPH-10', blockCode: 'A01', tickets: 3, harvesters: 2,
      ripe: 34, unripe: 1, rotten: 0, bunches: 35, looseFruitKg: 3.75, estKg: 647.5, bunchesNotTransported: 14,
    });
    expect(totalsByTph([])).toEqual([]);
  });
});
