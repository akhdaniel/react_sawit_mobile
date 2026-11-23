import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { maintenanceViews } from '@/db/repositories/maintenance';
import type { MaintenanceWorkType } from '@/sync/contract';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export default function MaintenanceListScreen() {
  const refresh = useRefresh();
  const { db, clock } = useServices();
  const workDate = clock.workDate();
  const rows = useTableQuery(['maintenance_ticket', 'tx_document'], () => maintenanceViews(db, workDate));

  return (
    <Screen refresh={refresh} title={t('maintenance.title')} back>
      <Button icon="sprout" label={t('maintenance.new')} onPress={() => router.push('/maintenance/new')} />
      <SectionTitle>{`${t('maintenance.today')} (${rows.length})`}</SectionTitle>
      {rows.length === 0 ? (
        <Card padded>
          <Txt>{t('maintenance.none')}</Txt>
        </Card>
      ) : (
        <Card>
          {rows.map((r, i) => (
            <Pressable
              key={r.mobileUuid}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/maintenance/[id]', params: { id: r.mobileUuid } })}
              style={({ pressed }) => [styles.row, i < rows.length - 1 && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
            >
              <View style={styles.icon}>
                <Icon name="sprout" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: '700' }}>{r.workerName}</Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>
                  {t(`maintenance.workTypes.${r.workType as MaintenanceWorkType}`)} · {t('fertilization.block')} {r.blockCode}
                  {r.subBlokCode ? ` / ${r.subBlokCode}` : ''}
                </Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>
                  {r.areaHa} ha · {r.treeCount} pokok · {r.hk} HK · {r.materials.length} material · {t(`status.${r.status}`)}
                </Txt>
              </View>
              <Icon name="chevron-right" size={24} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
