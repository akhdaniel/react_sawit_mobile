/** Laporan harian: ringkasan otomatis dari data hari ini + tanda tangan mandor/asisten. */
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { SignaturePad, type SignaturePadRef } from '@/components/SignaturePad';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { buildDailySummary, latestReport } from '@/db/repositories/daily-report';
import { useGangSelection } from '@/features/attendance/useGang';
import { submitDailyReport } from '@/features/report/actions';
import { t } from '@/i18n/id';
import { persistSignature } from '@/lib/photo.expo';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

export default function NewDailyReportScreen() {
  const services = useServices();
  const { db, clock } = services;
  const date = clock.workDate();
  const { gangs, selected, select } = useGangSelection();
  const pad = useRef<SignaturePadRef>(null);
  const [busy, setBusy] = useState(false);

  const summary = useTableQuery(['attendance', 'assignment', 'harvest_ticket', 'spb_line', 'upkeep', 'material_usage', String(selected?.id)], () =>
    selected ? buildDailySummary(db, date, selected.id) : null,
  );
  const existing = useTableQuery(['daily_report', String(selected?.id)], () => (selected ? latestReport(db, date, selected.id) : null));

  const submit = async () => {
    if (!selected || !summary) return;
    if (pad.current?.isEmpty()) {
      Alert.alert(t('report.title'), t('report.signFirst'));
      return;
    }
    setBusy(true);
    try {
      const tmp = await pad.current!.capture();
      const id = randomUUID();
      const sig = await persistSignature(tmp, id);
      const r = submitDailyReport(db, await services.txContext(), date, selected.id, { id, ...sig });
      Alert.alert(t('report.title'), r.corrected ? t('report.savedCorrection') : t('report.saved'));
      router.back();
    } catch (e) {
      Alert.alert(t('report.title'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const a = summary?.attendance;
  return (
    <Screen title={t('report.new')} subtitle={date} back scroll>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {gangs.map((g) => (
          <Chip key={g.id} label={g.name} selected={g.id === selected?.id} onPress={() => select(g.id)} />
        ))}
      </ScrollView>
      {existing && (
        <View style={styles.notice}>
          <Icon name="information" size={22} color={colors.text} />
          <Txt style={{ flex: 1, fontWeight: '700' }}>{t('report.replaceNotice')}</Txt>
        </View>
      )}
      {summary && a && (
        <>
          <SectionTitle>{t('report.attendance')}</SectionTitle>
          <Card>
            <ListRow icon="account-check" tone="success" label={t('attendance.status.hadir')} value={String(a.hadir)} />
            <ListRow icon="clock-alert" tone="accent" label={t('attendance.status.terlambat')} value={String(a.terlambat)} />
            <ListRow icon="account-cancel" tone="danger" label={`${t('attendance.status.sakit')} / ${t('attendance.status.izin')} / ${t('attendance.status.mangkir')}`} value={`${a.sakit} / ${a.izin} / ${a.mangkir}`} />
            <ListRow icon="home-export-outline" label={t('attendance.status.pulang')} value={String(a.pulang)} />
            <ListRow icon="clipboard-account" tone="accent" label={t('report.assignments')} value={String(summary.assignments)} last />
          </Card>
          <SectionTitle>{t('report.harvest')}</SectionTitle>
          <Card>
            <ListRow icon="palm-tree" label={t('report.tickets', { count: summary.harvest.tickets, bunches: summary.harvest.bunches, kg: Math.round(summary.harvest.estKg) })} />
            <ListRow icon="ticket-confirmation" tone="accent" label={t('report.lateEntries')} value={String(summary.harvest.lateEntries)} />
            <ListRow icon="truck-alert" tone="danger" label={t('report.notTransported')} value={String(summary.harvest.notTransported)} last />
          </Card>
          <SectionTitle>{t('report.upkeep')}</SectionTitle>
          <Card>
            <ListRow icon="sprout" label={t('report.jobs', { count: summary.upkeep.jobs, hk: summary.upkeep.hk, ha: summary.upkeep.ha })} />
            <ListRow icon="flask" tone="danger" label={t('report.overDose')} value={String(summary.upkeep.overDose)} last />
          </Card>
        </>
      )}
      <SectionTitle>{t('report.signature')}</SectionTitle>
      <SignaturePad ref={pad} />
      <Button kind="outline" icon="eraser" label={t('report.clear')} onPress={() => pad.current?.clear()} />
      <Button icon="file-sign" label={t('report.submit')} busy={busy} disabled={!selected} onPress={() => void submit()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
});
