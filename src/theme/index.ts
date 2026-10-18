/**
 * Tema "Xerpium Violet": header gradien ungu→pink, kartu putih membulat dengan bayangan
 * lembut, latar abu-lavender, aksen pink.
 *
 * Tetap memenuhi prinsip pengguna lapangan: teks gelap pekat (kontras ≥ 7:1 di atas putih),
 * target sentuh minimal 56 dp, font dasar 18 sp. Warna pastel hanya untuk dekorasi
 * (latar ikon, garis aktif), tidak untuk teks.
 */
export const colors = {
  background: '#EFF0F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F4FD',
  text: '#1B1630',
  textMuted: '#4A4560',
  border: '#E3E0EF',
  borderStrong: '#B9B3CF',
  primary: '#6D28D9',
  primaryDark: '#5B21B6',
  onPrimary: '#FFFFFF',
  accent: '#DB2777',
  accentSoft: '#FCE7F3',
  primarySoft: '#EDE4FD',
  danger: '#B91C1C',
  onDanger: '#FFFFFF',
  dangerSoft: '#FDE2E2',
  warning: '#FFC53D',
  onWarning: '#1B1630',
  warningSoft: '#FFF4D6',
  success: '#047857',
  successSoft: '#DCF5EA',
  disabled: '#A8A3BA',
} as const;

/** Gradien header & tombol utama (kiri-atas → kanan-bawah). */
export const gradients = {
  header: 'linear-gradient(135deg, #6D28D9 0%, #9333EA 55%, #DB2777 100%)',
  button: 'linear-gradient(90deg, #6D28D9 0%, #A21CAF 100%)',
  danger: 'linear-gradient(90deg, #B91C1C 0%, #DB2777 100%)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  base: 18,
  small: 16,
  large: 20,
  title: 24,
  hero: 28,
  lineHeight: 26,
} as const;

export const touch = {
  /** Tinggi/lebar minimum elemen yang bisa diketuk (dp). */
  minSize: 56,
  /** Tinggi baris menu. */
  rowHeight: 64,
  radius: 14,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const shadows = {
  card: '0px 6px 18px rgba(76, 52, 140, 0.12)',
  floating: '0px 10px 28px rgba(76, 52, 140, 0.22)',
  button: '0px 6px 14px rgba(109, 40, 217, 0.30)',
} as const;

export const theme = { colors, gradients, spacing, typography, touch, radius, shadows } as const;
export type Theme = typeof theme;
