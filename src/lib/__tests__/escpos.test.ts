import { bytesToBase64 } from '@/lib/base64';
import { chunk, EscPos, toAscii, twoColumns, wrap } from '@/lib/escpos';
import { pickWritable } from '@/lib/printer-select';

describe('base64', () => {
  it('sama dengan Buffer Node', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'Xerpium Sawit!', '\u0000ÿ\u0010']) {
      const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});

describe('ESC/POS', () => {
  it('ASCII aman: diakritik dihapus, karakter lain jadi ?', () => {
    expect(toAscii('Café №1 – ok')).toBe('Cafe ?1 ? ok');
  });

  it('wrap 32 kolom memotong di spasi', () => {
    const lines = wrap('Pemanen: Slamet Riyadi bin Ahmad Siregar dari Afdeling III');
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    expect(lines.join(' ')).toBe('Pemanen: Slamet Riyadi bin Ahmad Siregar dari Afdeling III');
    expect(wrap('X'.repeat(40))).toEqual(['X'.repeat(32), 'X'.repeat(8)]);
  });

  it('dua kolom rata kiri-kanan 32 karakter', () => {
    expect(twoColumns('Janjang', '23')).toBe('Janjang' + ' '.repeat(23) + '23');
    expect(twoColumns('A'.repeat(40), '99')).toHaveLength(32);
  });

  it('perintah dasar dan QR (GS ( k) terbentuk benar', () => {
    const b = Array.from(new EscPos().init().bold(true).line('Hi').qr('ABC', 6).cut().build());
    expect(b.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(b.slice(2, 5)).toEqual([0x1b, 0x45, 1]);
    expect(b.slice(5, 8)).toEqual([0x48, 0x69, 0x0a]);
    // simpan data QR: GS ( k pL pH 31 50 30 + data (len = 3 + 3)
    const store = b.findIndex((x, i) => x === 0x1d && b[i + 1] === 0x28 && b[i + 5] === 0x31 && b[i + 6] === 0x50);
    expect(b.slice(store + 3, store + 5)).toEqual([6, 0]);
    expect(b.slice(store + 8, store + 11)).toEqual([0x41, 0x42, 0x43]);
    expect(b.slice(-4)).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('chunk sesuai MTU', () => {
    expect(chunk(new Uint8Array(45), 20).map((c) => c.length)).toEqual([20, 20, 5]);
  });
});

describe('pemilihan karakteristik printer', () => {
  it('utamakan layanan printer umum dan write-without-response', () => {
    const t = pickWritable([
      { serviceUUID: '0000180a-0000-1000-8000-00805f9b34fb', uuid: 'a', isWritableWithResponse: true, isWritableWithoutResponse: false },
      { serviceUUID: '000018f0-0000-1000-8000-00805f9b34fb', uuid: 'b', isWritableWithResponse: true, isWritableWithoutResponse: false },
      { serviceUUID: '000018f0-0000-1000-8000-00805f9b34fb', uuid: 'c', isWritableWithResponse: false, isWritableWithoutResponse: true },
    ]);
    expect(t).toEqual({ serviceUUID: '000018f0-0000-1000-8000-00805f9b34fb', characteristicUUID: 'c', withoutResponse: true });
    expect(pickWritable([{ serviceUUID: 'x', uuid: 'y', isWritableWithResponse: false, isWritableWithoutResponse: false }])).toBeNull();
  });
});
