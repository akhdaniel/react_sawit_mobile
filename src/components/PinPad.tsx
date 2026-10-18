import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '@/i18n/id';
import { colors, spacing, touch, typography } from '@/theme';

import { Txt } from './Txt';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

/**
 * Keypad PIN besar (tombol 72 dp) — tidak bergantung pada keyboard sistem,
 * mudah ditekan dengan sarung tangan/jari basah.
 */
export function PinPad({
  maxLength,
  minLength,
  onSubmit,
  disabled,
}: {
  maxLength: number;
  minLength: number;
  onSubmit: (pin: string) => void;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState('');

  const press = (k: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else if (k === 'ok') {
      if (pin.length >= minLength) {
        onSubmit(pin);
        setPin('');
      }
    } else if (pin.length < maxLength) setPin((p) => p + k);
  };

  return (
    <View style={styles.root}>
      <View style={styles.dots} accessibilityLabel={`${pin.length} digit`}>
        {Array.from({ length: maxLength }, (_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k) => {
          const label = k === 'del' ? '⌫' : k === 'ok' ? t('auth.ok') : k;
          const okDisabled = k === 'ok' && pin.length < minLength;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? t('auth.delete') : label}
              disabled={disabled || okDisabled}
              onPress={() => press(k)}
              style={({ pressed }) => [
                styles.key,
                k === 'ok' && { backgroundColor: okDisabled ? colors.disabled : colors.primary },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Txt style={[styles.keyText, k === 'ok' && { color: colors.onPrimary }]}>{label}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const KEY = Math.max(72, touch.minSize);

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.md, minHeight: 24 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  dotFilled: { backgroundColor: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: KEY * 3 + spacing.md * 2, gap: spacing.md },
  key: {
    width: KEY,
    height: KEY,
    borderRadius: touch.radius,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  keyText: { fontSize: typography.title, fontWeight: '700' },
});
