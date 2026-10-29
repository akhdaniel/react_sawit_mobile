import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { upkeepsFor } from '@/db/repositories/upkeep';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export default function UpkeepListScreen() {
  const { db, clock } = useServices();
  const workDate = clock.workDate();
  const rows = useTableQuery(['upkeep', 'material_usage'], () => upkeepsFor(db, workDate));

  return (
    <Screen title={t('upkeep.title')} back>
      <Button icon="sprout" label={t('upkeep.new')} onPress={() => router.push('/upkeep/new')} />
      <SectionTitle>{t('upkeep.today')}</SectionTitle>
      {rows.length === 0 ? (
        <Card padded>
          <Txt>{t('upkeep.none')}</Txt>
        </Card>
      ) : (
        <Card>
          {rows.map((r, i) => (
            <Pressable
              key={r.mobileUuid}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/upkeep/[id]', params: { id: r.mobileUuid } })}
              style={({ pressed }) => [styles.row, i < rows.length - 1 && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
            >
              <View style={styles.icon}>
                <Icon name="sprout" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: '700' }}>
                  {r.activityName} · {t('upkeep.block')} {r.blockCode}
                </Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>
                  {r.hk} HK{r.realizedHa != null ? ` · ${r.realizedHa} ha` : ''}{r.realizedTrees != null ? ` · ${r.realizedTrees} pokok` : ''} · {t(`status.${r.status}`)}
                </Txt>
                {r.materials.map((m, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                    <Txt variant="small">• {m.productName}: {m.qty} {m.uom}</Txt>
                    {m.overDose && <StatusPill label={t('upkeep.overBadge')} tone="danger" />}
                  </View>
                ))}
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
