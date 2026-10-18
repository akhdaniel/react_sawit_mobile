import { StyleSheet, View } from 'react-native';

import { useRiskWarnings } from '@/features/security/useRiskWarnings';
import { t } from '@/i18n/id';
import { colors, spacing } from '@/theme';

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
          <View key={w} style={[styles.item, { backgroundColor: severe ? colors.danger : colors.warning }]}>
            <Txt style={{ color: severe ? colors.onDanger : colors.onWarning, fontWeight: '700' }}>
              ⚠ {t(`warning.${w}`, { minutes: skewMinutes })}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 1 },
  item: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
