/** Inspeksi hari ini (filter jenis) dengan status sinkron per baris; tombol inspeksi baru dan temuan terbuka. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { inspectionViews } from '@/db/repositories/inspection';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { INSPECTION_TYPES, type InspectionType } from '@/sync/contract';
import { colors, spacing } from '@/theme';

export default function InspectionListScreen() {
  const refresh = useRefresh();
  const { db, clock } = useServices();
  const workDate = clock.workDate();
  const [type, setType] = useState<InspectionType | null>(null);
  const all = useTableQuery(['inspection', 'inspection_finding', 'inspection_template'], () => inspectionViews(db, workDate));
  const rows = type ? all.filter((r) => r.inspectionType === type) : all;
  const types = INSPECTION_TYPES.filter((x) => all.some((r) => r.inspectionType === x));

  return (
    <Screen refresh={refresh} title={t('inspection.title')} back>
      <Button icon="clipboard-plus-outline" label={t('inspection.new')} onPress={() => router.push('/inspection/new')} />
      <Button kind="outline" icon="alert-circle-check" label={t('inspection.openFindings')} onPress={() => router.push('/findings')} />
      <SectionTitle>{`${t('inspection.today')} (${rows.length})`}</SectionTitle>
      {types.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <Chip label={t('inspection.allTypes')} selected={type == null} onPress={() => setType(null)} />
          {types.map((x) => (
            <Chip key={x} label={t(`inspection.types.${x}`)} selected={x === type} onPress={() => setType(x)} />
          ))}
        </ScrollView>
      )}
      {rows.length === 0 ? (
        <Card padded>
          <Txt>{t('inspection.none')}</Txt>
        </Card>
      ) : (
        <Card>
          {rows.map((r, i) => (
            <Pressable
              key={r.mobileUuid}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: r.mobileUuid } })}
              style={({ pressed }) => [styles.row, i < rows.length - 1 && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
            >
              <View style={styles.icon}>
                <Icon name="clipboard-check-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt style={{ fontWeight: '700' }}>
                  {t(`inspection.types.${r.inspectionType}`)} · {t('inspection.block')} {r.blockCode}
                </Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>
                  {r.templateName} · {t('inspection.findings', { count: r.findingCount })}
                </Txt>
                <View style={styles.pills}>
                  {r.inspectionType !== 'taksasi' && r.inspectionType !== 'sensus' && (
                    <StatusPill label={`${t('inspection.score')} ${r.scorePct.toFixed(1)}%`} tone="primary" />
                  )}
                  {r.criticalCount > 0 && <StatusPill label={`${r.criticalCount} ${t('finding.severities.critical')}`} tone="danger" />}
                  <StatusPill label={t(`status.${r.status}`)} tone={r.status === 'rejected' ? 'danger' : r.status === 'queued' ? 'warning' : 'success'} />
                </View>
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
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, alignItems: 'center' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
