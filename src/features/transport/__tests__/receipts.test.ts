import { buildSpbReceipt, buildTicketReceipt } from '@/features/transport/receipts';

const text = (b: Uint8Array) => String.fromCharCode(...Array.from(b).filter((x) => x >= 0x20 && x < 0x7f || x === 0x0a));

describe('struk', () => {
  it('SPB memuat nomor, kendaraan, tiket, total', () => {
    const s = text(
      buildSpbReceipt({
        spbNo: 'AFD01-261018-AB12-0003',
        workDate: '2026-10-18',
        createdAt: '18/10/2026 14.00',
        vehiclePlate: 'BM 8101 AK',
        driverName: 'Budi',
        destination: 'PKS sendiri',
        parentSpbNo: 'AFD01-261018-AB12-0001',
        tickets: [{ ticketNo: 'AFD01-261018-CD34-0007', blockCode: 'A01', bunches: 23, estKg: 425.5 }],
        totalBunch: 23,
        estKg: 425.5,
        clerkName: 'Dedi',
        qr: 'XSM1|SPB|x',
      }),
    );
    expect(s).toContain('AFD01-261018-AB12-0003');
    expect(s).toContain('BM 8101 AK');
    expect(s).toContain('Langsir dari');
    expect(s).toContain('CD34-0007 A01');
    expect(s).toMatch(/TOTAL JANJANG\s+23/);
    expect(s).toMatch(/ESTIMASI KG\s+426/);
  });

  it('tiket susulan diberi tanda', () => {
    const s = text(
      buildTicketReceipt({ ticketNo: 'T-1', workDate: '2026-10-18', blockCode: 'A01', tphCode: 'A01-T1', harvesterName: 'Agus', ripe: 1, unripe: 0, rotten: 0, looseFruitKg: 0, estKg: 18.5, lateEntry: true, qr: 'q' }),
    );
    expect(s).toContain('** SUSULAN **');
    expect(s).toContain('Pemanen: Agus');
  });
});
