import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { colors, spacing, touch, typography } from '@/theme';

import { Txt } from './Txt';

type Kind = 'primary' | 'danger' | 'outline';

const palette: Record<Kind, { bg: string; fg: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary },
  danger: { bg: colors.danger, fg: colors.onDanger },
  outline: { bg: colors.background, fg: colors.text },
};

export function Button({
  label,
  kind = 'primary',
  busy = false,
  disabled,
  ...rest
}: PressableProps & { label: string; kind?: Kind; busy?: boolean }) {
  const p = palette[kind];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy }}
      disabled={off}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: off ? colors.disabled : p.bg, opacity: pressed ? 0.8 : 1 },
        kind === 'outline' && styles.outline,
      ]}
      {...rest}
    >
      {busy ? <ActivityIndicator color={p.fg} /> : <Txt style={[styles.label, { color: p.fg }]}>{label}</Txt>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.minSize,
    minWidth: touch.minSize,
    borderRadius: touch.radius,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: { borderWidth: 2, borderColor: colors.border },
  label: { fontSize: typography.large, fontWeight: '700' },
});
