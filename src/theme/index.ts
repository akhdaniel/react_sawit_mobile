/**
 * Tema untuk pengguna lapangan: kontras tinggi (terbaca di bawah matahari),
 * target sentuh minimal 56 dp, font dasar 18 sp.
 */
export const colors = {
  background: '#FFFFFF',
  surface: '#F2F2F2',
  text: '#000000',
  textMuted: '#333333',
  border: '#000000',
  primary: '#0B5D1E',
  onPrimary: '#FFFFFF',
  danger: '#B00020',
  onDanger: '#FFFFFF',
  warning: '#FFC400',
  onWarning: '#000000',
  success: '#0B5D1E',
  disabled: '#9E9E9E',
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
  large: 22,
  title: 26,
  lineHeight: 26,
} as const;

export const touch = {
  /** Tinggi/lebar minimum elemen yang bisa diketuk (dp). */
  minSize: 56,
  radius: 8,
} as const;

export const theme = { colors, spacing, typography, touch } as const;
export type Theme = typeof theme;
