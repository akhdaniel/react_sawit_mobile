import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Txt } from './Txt';

export type PillTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

const tones: Record<PillTone, { bg: string; fg: string }> = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.text },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
  primary: { bg: colors.primarySoft, fg: colors.primary },
};

export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Txt variant="small" style={{ color: t.fg, fontWeight: '800' }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
});
