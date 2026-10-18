import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme';

import { Txt } from './Txt';

/** Kartu putih membulat dengan bayangan lembut. */
export function Card({ children, padded, style }: { children: ReactNode; padded?: boolean; style?: ViewStyle }) {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Txt variant="small" style={styles.section}>
      {children.toUpperCase()}
    </Txt>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    boxShadow: shadows.card,
  },
  padded: { padding: spacing.md, gap: spacing.md },
  section: { color: colors.textMuted, fontWeight: '700', letterSpacing: 0.8, marginTop: spacing.sm, marginLeft: spacing.xs },
});
