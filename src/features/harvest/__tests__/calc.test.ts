import { EMPTY_COUNTS, estKg, formatRupiah, premiEstimate, totalBunches } from '@/features/harvest/calc';
import { encodeTicketQr, parseTicketQr } from '@/features/harvest/qr';

const penalties = new Map([['MENTAH', 5000], ['TGKPJG', 1000], ['BRDTGL', 2000]]);

describe('kalkulasi panen', () => {
  it('est_kg = (matang + mentah + busuk) × BJR', () => {
    const c = { ...EMPTY_COUNTS, ripe: 20, unripe: 2, rotten: 1, emptyBunch: 5 };
    expect(totalBunches(c)).toBe(23);
    expect(estKg(c, 18.5)).toBe(425.5);
    expect(estKg(c, 0)).toBe(0);
  });

  it('premi per janjang hanya untuk matang, dikurangi denda mentah & tangkai panjang', () => {
    const r = premiEstimate({ ...EMPTY_COUNTS, ripe: 40, unripe: 2, longStalk: 3 }, { wageBasis: 'per_bunch', rate: 2500 }, penalties);
    expect(r).toEqual({
      basis: 'per_bunch',
      gross: 100000,
      penalty: 13000,
      net: 87000,
      penalties: [
        { code: 'MENTAH', count: 2, amount: 10000 },
        { code: 'TGKPJG', count: 3, amount: 3000 },
      ],
    });
  });

  it('upah harian tidak bergantung jumlah; per_ha/per_tree = 0; tanpa kegiatan = 0', () => {
    expect(premiEstimate({ ...EMPTY_COUNTS, ripe: 5 }, { wageBasis: 'daily', rate: 120000 }, penalties).gross).toBe(120000);
    expect(premiEstimate({ ...EMPTY_COUNTS, ripe: 5 }, { wageBasis: 'per_ha', rate: 75000 }, penalties).gross).toBe(0);
    expect(premiEstimate({ ...EMPTY_COUNTS, ripe: 5 }, null, new Map()).net).toBe(0);
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
});
