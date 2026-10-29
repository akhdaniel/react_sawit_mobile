import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing, touch, typography } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

/** Input angka besar dengan tombol − / + 56 dp; bisa diketik langsung. */
export function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  decimal = false,
  large = false,
  autoFocus,
  readOnly = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  decimal?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  /** Tampilan data tersimpan: tanpa tombol − / + dan tidak bisa diketik. */
  readOnly?: boolean;
}) {
  const set = (n: number) => onChange(Math.max(0, decimal ? Math.round(n * 10) / 10 : Math.round(n)));
  return (
    <View style={styles.wrap}>
      <Txt style={[styles.label, large && { fontSize: typography.large }]}>{label}</Txt>
      <View style={styles.row}>
        {!readOnly && (
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} kurang`} onPress={() => set(value - step)} style={styles.btn}>
            <Icon name="minus" size={30} color={colors.primary} />
          </Pressable>
        )}
        <TextInput
          accessibilityLabel={label}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          onChangeText={(txt) => {
            const n = Number(txt.replace(',', '.'));
            if (!Number.isNaN(n)) set(n);
            else if (txt === '') set(0);
          }}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          autoFocus={autoFocus}
          selectTextOnFocus
          editable={!readOnly}
          style={[styles.input, large && styles.inputLarge, readOnly && styles.inputReadOnly]}
        />
        {!readOnly && (
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} tambah`} onPress={() => set(value + step)} style={styles.btn}>
            <Icon name="plus" size={30} color={colors.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: {
    width: touch.minSize + 8,
    height: touch.minSize + 8,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: touch.minSize + 8,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: typography.title,
    fontWeight: '800',
    color: colors.text,
  },
  inputLarge: { fontSize: 36, minHeight: 80 },
  inputReadOnly: { backgroundColor: colors.background },
});
