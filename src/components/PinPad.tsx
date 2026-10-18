import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '@/i18n/id';
import { colors, gradients, shadows, spacing, touch, typography } from '@/theme';

import { Icon } from './Icon';

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
          const label = k === 'ok' ? t('auth.ok') : k;
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
                k === 'ok' && (okDisabled ? { backgroundColor: colors.disabled } : { backgroundImage: gradients.button, boxShadow: shadows.button }),
                k === 'del' && styles.keyGhost,
                pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
              ]}
            >
              {k === 'del' ? (
                <Icon name="backspace-outline" size={32} color={colors.text} />
              ) : (
                <Txt style={[styles.keyText, k === 'ok' && { color: colors.onPrimary, fontSize: typography.large }]}>{label}</Txt>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const KEY = Math.max(76, touch.minSize);

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.md, minHeight: 24 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.borderStrong },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: KEY * 3 + spacing.lg * 2, gap: spacing.lg, justifyContent: 'center' },
  key: {
    width: KEY,
    height: KEY,
    borderRadius: KEY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  keyGhost: { backgroundColor: colors.surfaceMuted, boxShadow: undefined },
  keyText: { fontSize: typography.hero, fontWeight: '700' },
});
