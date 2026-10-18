import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touch, typography } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

type Tone = 'primary' | 'accent' | 'danger' | 'success';

const tones: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  success: { bg: colors.successSoft, fg: colors.success },
};

/**
 * Baris menu/info: ikon dalam kotak lembut, label, nilai/deskripsi, chevron.
 * Tinggi minimal 64 dp agar mudah diketuk.
 */
export function ListRow({
  icon,
  tone = 'primary',
  label,
  description,
  value,
  onPress,
  last,
  badge,
}: {
  icon?: IconName;
  tone?: Tone;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  badge?: string;
}) {
  const t = tones[tone];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {icon && (
        <View style={[styles.iconBox, { backgroundColor: t.bg }]}>
          <Icon name={icon} size={24} color={t.fg} />
        </View>
      )}
      <View style={styles.texts}>
        <Txt style={[styles.label, tone === 'danger' && { color: colors.danger }]}>{label}</Txt>
        {!!description && <Txt variant="small" style={{ color: colors.textMuted }}>{description}</Txt>}
      </View>
      {!!value && <Txt style={styles.value}>{value}</Txt>}
      {!!badge && (
        <View style={styles.badge}>
          <Txt variant="small" style={{ color: colors.onWarning, fontWeight: '700' }}>
            {badge}
          </Txt>
        </View>
      )}
      {onPress && <Icon name="chevron-right" size={28} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  label: { fontSize: typography.base, fontWeight: '600' },
  value: { fontWeight: '700', maxWidth: '55%', textAlign: 'right' },
  badge: { backgroundColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});
