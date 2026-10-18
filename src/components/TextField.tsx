import type { ComponentRef, Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, spacing, touch, typography } from '@/theme';

import { Txt } from './Txt';

export type TextInputRef = ComponentRef<typeof TextInput>;

export function TextField({
  label,
  error,
  style,
  ref,
  ...rest
}: Omit<TextInputProps, 'ref'> & { label: string; error?: string; ref?: Ref<TextInputRef> }) {
  return (
    <View style={styles.wrap}>
      <Txt style={styles.label}>{label}</Txt>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, !!error && { borderColor: colors.danger }, style]}
        {...rest}
      />
      {!!error && <Txt style={styles.error}>{error}</Txt>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontWeight: '700' },
  input: {
    minHeight: touch.minSize,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: touch.radius,
    paddingHorizontal: spacing.md,
    fontSize: typography.large,
    color: colors.text,
    backgroundColor: colors.background,
  },
  error: { color: colors.danger, fontWeight: '700' },
});
