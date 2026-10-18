import { t } from '@/i18n/id';

describe('i18n', () => {
  it('mengisi placeholder', () => {
    expect(t('header.pendingSome', { count: 12 })).toBe('12 data belum terkirim');
  });
  it('mengembalikan teks tanpa parameter', () => {
    expect(t('status.rejected')).toBe('Ditolak');
  });
});
