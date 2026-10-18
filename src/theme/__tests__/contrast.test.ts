import { colors } from '@/theme';
import { contrastRatio } from '@/theme/contrast';

/**
 * Prinsip lapangan: teks harus terbaca di bawah matahari.
 * Target: teks biasa ≥ 7:1 (WCAG AAA), teks besar/tebal di atas warna ≥ 4.5:1.
 */
describe('kontras tema', () => {
  it.each([
    ['teks di kartu', colors.text, colors.surface, 7],
    ['teks di latar', colors.text, colors.background, 7],
    ['teks sekunder di kartu', colors.textMuted, colors.surface, 7],
    ['putih di ungu utama', colors.onPrimary, colors.primary, 7],
    ['putih di pink aksen (ujung gradien)', colors.onPrimary, colors.accent, 4.5],
    ['putih di merah bahaya', colors.onDanger, colors.danger, 4.5],
    ['teks di kuning peringatan', colors.onWarning, colors.warning, 7],
    ['teks di pink lembut', colors.text, colors.accentSoft, 7],
    ['hijau sukses di kartu', colors.success, colors.surface, 4.5],
  ])('%s', (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
