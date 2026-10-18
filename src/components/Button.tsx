import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { colors, gradients, radius, shadows, spacing, touch, typography } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

type Kind = 'primary' | 'danger' | 'outline';

export function Button({
  label,
  kind = 'primary',
  busy = false,
  icon,
  disabled,
  ...rest
}: PressableProps & { label: string; kind?: Kind; busy?: boolean; icon?: IconName }) {
  const off = !!disabled || busy;
  // Saat busy tombol tetap berwarna (bukan abu-abu) agar jelas sedang diproses.
  const gray = !!disabled && !busy;
  const filled = kind !== 'outline';
  const fg = filled ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      style={({ pressed }) => [
        styles.base,
        filled
          ? { backgroundImage: gray ? undefined : kind === 'danger' ? gradients.danger : gradients.button, boxShadow: gray ? undefined : shadows.button }
          : styles.outline,
        gray && filled && { backgroundColor: colors.disabled },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {busy ? (
          <ActivityIndicator color={fg} />
        ) : (
          icon && <Icon name={icon} size={24} color={gray && !filled ? colors.disabled : fg} />
        )}
        <Txt style={[styles.label, { color: gray && !filled ? colors.disabled : fg }]}>{label}</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.minSize,
    minWidth: touch.minSize,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: typography.large, fontWeight: '700' },
});
