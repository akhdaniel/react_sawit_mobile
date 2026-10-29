/** Laporan harian tersimpan: ringkasan saat ditandatangani + tanda tangan, tidak bisa diubah. */
import { eq } from 'drizzle-orm';
import { useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet } from 'react-native';

import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import type { DailySummary } from '@/db/repositories/daily-report';
import { dailyReport, gang, photo } from '@/db/schema';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

export default function DailyReportEntryScreen() {
  const { db } = useServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const row = useTableQuery(['daily_report'], () => db.select().from(dailyReport).where(eq(dailyReport.mobileUuid, id)).get() ?? null);
  const refs = useTableQuery(['gang', 'photo', 'daily_report'], () => {
    if (!row) return null;
    return {
      gangName: db.select().from(gang).where(eq(gang.id, row.gangId)).get()?.name ?? `#${row.gangId}`,
      signature: row.signaturePngId ? (db.select().from(photo).where(eq(photo.id, row.signaturePngId)).get() ?? null) : null,
    };
  });

  if (!row || !refs) {
    return (
      <Screen title={t('report.title')} back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }
  const summary = row.summaryJson as unknown as DailySummary;
  const a = summary.attendance;

  return (
    <Screen title={t('report.title')} subtitle={row.date} back>
      <SavedEntryNotice status={row.status} savedAt={row.createdTrustedAt}>
        {row.correctionOf && <StatusPill label={t('report.savedCorrection')} tone="warning" />}
      </SavedEntryNotice>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Chip label={refs.gangName} selected />
      </ScrollView>

      {a && (
        <>
          <SectionTitle>{t('report.attendance')}</SectionTitle>
          <Card>
            <ListRow icon="account-check" tone="success" label={t('attendance.status.hadir')} value={String(a.hadir)} />
            <ListRow icon="clock-alert" tone="accent" label={t('attendance.status.terlambat')} value={String(a.terlambat)} />
            <ListRow icon="account-cancel" tone="danger" label={`${t('attendance.status.sakit')} / ${t('attendance.status.izin')} / ${t('attendance.status.mangkir')}`} value={`${a.sakit} / ${a.izin} / ${a.mangkir}`} />
            <ListRow icon="home-export-outline" label={t('attendance.status.pulang')} value={String(a.pulang)} />
            <ListRow icon="clipboard-account" tone="accent" label={t('report.assignments')} value={String(summary.assignments)} last />
          </Card>
        </>
      )}
      {summary.harvest && (
        <>
          <SectionTitle>{t('report.harvest')}</SectionTitle>
          <Card>
            <ListRow icon="palm-tree" label={t('report.tickets', { count: summary.harvest.tickets, bunches: summary.harvest.bunches, kg: Math.round(summary.harvest.estKg) })} />
            <ListRow icon="ticket-confirmation" tone="accent" label={t('report.lateEntries')} value={String(summary.harvest.lateEntries)} />
            <ListRow icon="truck-alert" tone="danger" label={t('report.notTransported')} value={String(summary.harvest.notTransported)} last />
          </Card>
        </>
      )}
      {summary.upkeep && (
        <>
          <SectionTitle>{t('report.upkeep')}</SectionTitle>
          <Card>
            <ListRow icon="sprout" label={t('report.jobs', { count: summary.upkeep.jobs, hk: summary.upkeep.hk, ha: summary.upkeep.ha })} />
            <ListRow icon="flask" tone="danger" label={t('report.overDose')} value={String(summary.upkeep.overDose)} last />
          </Card>
        </>
      )}

      <SectionTitle>{t('report.signature')}</SectionTitle>
      <Card padded>
        {refs.signature ? (
          <Image source={{ uri: refs.signature.localUri }} style={styles.signature} resizeMode="contain" accessibilityLabel={t('report.signature')} />
        ) : (
          <Txt>{t('entry.noPhoto')}</Txt>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  signature: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.surface },
});
