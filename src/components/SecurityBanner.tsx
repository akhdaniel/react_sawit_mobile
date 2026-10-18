import { StyleSheet, View } from 'react-native';

import { useRiskWarnings } from '@/features/security/useRiskWarnings';
import { t } from '@/i18n/id';
import { colors, radius, spacing } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

/** Banner peringatan root/emulator, fake GPS, dan jam tidak terkalibrasi. */
export function SecurityBanner() {
  const { warnings, skewMinutes } = useRiskWarnings();
  if (warnings.length === 0) return null;
  return (
    <View accessibilityRole="alert" style={styles.root}>
      {warnings.map((w) => {
        const severe = w === 'device_compromised' || w === 'mocked_location';
        return (
          <View key={w} style={[styles.item, severe ? styles.severe : styles.warn]}>
            <Icon name={severe ? 'shield-alert' : 'clock-alert-outline'} size={24} color={severe ? colors.onDanger : colors.text} />
            <Txt style={{ flex: 1, color: severe ? colors.onDanger : colors.text, fontWeight: '700' }}>
              {t(`warning.${w}`, { minutes: skewMinutes })}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  severe: { backgroundColor: colors.danger },
  warn: { backgroundColor: colors.warningSoft, borderLeftWidth: 6, borderLeftColor: colors.warning },
});
