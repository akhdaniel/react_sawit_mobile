import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing, touch, typography } from '@/theme';

import { Txt } from './Txt';

export type TextInputRef = ComponentRef<typeof TextInput>;

export function TextField({
  label,
  error,
  style,
  ref,
  onFocus,
  onBlur,
  ...rest
}: Omit<TextInputProps, 'ref'> & { label: string; error?: string; ref?: Ref<TextInputRef> }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Txt style={styles.label}>{label}</Txt>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && { borderColor: colors.primary, backgroundColor: colors.surface },
          !!error && { borderColor: colors.danger },
          style,
        ]}
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
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.large,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  error: { color: colors.danger, fontWeight: '700' },
});
