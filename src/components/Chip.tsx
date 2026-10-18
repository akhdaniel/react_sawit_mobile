import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme';

import { Txt } from './Txt';

/** Pill pilihan (56 dp) — terpilih = gradien ungu. */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected ? styles.on : styles.off, pressed && { opacity: 0.85 }]}
    >
      <Txt style={{ fontWeight: '700', color: selected ? colors.onPrimary : colors.text }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: touch.minSize, paddingHorizontal: spacing.lg, borderRadius: radius.pill, justifyContent: 'center' },
  on: { backgroundColor: colors.primary },
  off: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
});
