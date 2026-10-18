import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useSession } from '@/features/auth/session-store';
import { canAccess, MENU, type MenuKey } from '@/features/menu/menu';
import { t } from '@/i18n/id';
import { colors, radius, spacing } from '@/theme';

/** Placeholder modul yang belum dibangun; juga menolak akses lintas peran. */
export default function ModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const roles = useSession((s) => s.user?.roles ?? []);
  const item = MENU.find((m) => m.key === key);
  const allowed = !!item && canAccess(item.key as MenuKey, roles);

  return (
    <Screen title={item ? t(item.label) : '—'} back>
      <Card padded style={{ alignItems: 'center' }}>
        <View style={styles.iconBox}>
          <Icon name={(item?.icon ?? 'help') as IconName} size={48} color={colors.primary} />
        </View>
        <Txt variant="large" style={{ textAlign: 'center', fontWeight: '600' }}>
          {allowed && item ? t('menu.comingSoon', { stage: item.stage }) : t('menu.forbidden')}
        </Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBox: { width: 88, height: 88, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
});
