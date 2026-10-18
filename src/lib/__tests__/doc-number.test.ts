import { deviceShortFrom, docPrefix, formatDocNo, yymmdd } from '@/lib/doc-number';
import { DOC_NO_REGEX } from '@/sync/contract';

describe('doc-number', () => {
  it('yymmdd dari tanggal kerja', () => {
    expect(yymmdd('2026-01-05')).toBe('260105');
    expect(() => yymmdd('2026-1-5')).toThrow();
  });

  it('deviceShortFrom stabil, 4 karakter A-Z0-9', () => {
    const a = deviceShortFrom('android-8f3a9c2b11');
    expect(a).toMatch(/^[A-Z0-9]{4}$/);
    expect(deviceShortFrom('android-8f3a9c2b11')).toBe(a);
    expect(deviceShortFrom('android-other')).not.toBe(a);
  });

  it('format lengkap cocok dengan regex kontrak', () => {
    const no = formatDocNo(docPrefix('AFD02', '2026-10-18', 'Z9X1'), 37);
    expect(no).toBe('AFD02-261018-Z9X1-0037');
    expect(no).toMatch(DOC_NO_REGEX);
  });

  it('menolak input tidak valid', () => {
    expect(() => docPrefix('afd-1', '2026-10-18', 'AB12')).toThrow();
    expect(() => docPrefix('AFD01', '2026-10-18', 'ab')).toThrow();
    expect(() => formatDocNo('P', 0)).toThrow();
    expect(() => formatDocNo('P', 10000)).toThrow();
  });
});
