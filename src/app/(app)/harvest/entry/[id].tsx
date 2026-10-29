/** Tiket panen tersimpan: form entry yang sama (blok, TPH, pemanen, janjang), tidak bisa diubah. */
import { asc, eq } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { NumberStepper } from '@/components/NumberStepper';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { canCorrect, ticketView } from '@/db/repositories/harvest';
import { activity, block, penaltyRule } from '@/db/schema';
import { EntryPhotos } from '@/features/entry/EntryPhotos';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { formatRupiah, premiEstimate } from '@/features/harvest/calc';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

const noop = () => {};

export default function HarvestEntryScreen() {
  const { db } = useServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tk = useTableQuery(['harvest_ticket', 'spb_line', 'spb'], () => ticketView(db, id));
  const correctable = useTableQuery(['harvest_ticket'], () => canCorrect(db, id));
  const bjr = useTableQuery(['block', 'harvest_ticket'], () => (tk ? (db.select().from(block).where(eq(block.id, tk.blockId)).get()?.bjrKg ?? 0) : 0));
  const harvestActivity = useTableQuery(['activity'], () => db.select().from(activity).where(eq(activity.kind, 'harvest')).orderBy(asc(activity.id)).get() ?? null);
  const penalties = useTableQuery(['penalty_rule'], () => new Map(db.select().from(penaltyRule).all().map((p) => [p.code, p.amount])));

  if (!tk) {
    return (
      <Screen title={t('harvest.detail')} back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }
  const counts = { ripe: tk.ripe, unripe: tk.unripe, rotten: tk.rotten, emptyBunch: tk.emptyBunch, longStalk: tk.longStalk, looseFruitKg: tk.looseFruitKg };
  const premi = premiEstimate(counts, harvestActivity, penalties);

  return (
    <Screen title={tk.ticketNo} subtitle={tk.workDate} back>
      <SavedEntryNotice status={tk.status} savedAt={tk.createdTrustedAt}>
        {tk.isLateEntry && <StatusPill label={t('harvest.lateEntry')} tone="warning" />}
      </SavedEntryNotice>

      <SectionTitle>{`${t('harvest.block')} · ${t('harvest.bjr', { bjr })}`}</SectionTitle>
      <View style={styles.grid}>
        <Chip label={tk.blockCode} selected />
      </View>
      <SectionTitle>{t('harvest.tph')}</SectionTitle>
      <View style={styles.grid}>
        <Chip label={tk.tphCode} selected />
      </View>
      <SectionTitle>{t('harvest.harvester')}</SectionTitle>
      <View style={styles.grid}>
        <Chip label={tk.harvesterName} selected />
      </View>

      <Card padded>
        <NumberStepper label={t('harvest.ripe')} value={tk.ripe} onChange={noop} large readOnly />
        <NumberStepper label={t('harvest.unripe')} value={tk.unripe} onChange={noop} readOnly />
        <NumberStepper label={t('harvest.rotten')} value={tk.rotten} onChange={noop} readOnly />
        <NumberStepper label={t('harvest.emptyBunch')} value={tk.emptyBunch} onChange={noop} readOnly />
        <NumberStepper label={t('harvest.longStalk')} value={tk.longStalk} onChange={noop} readOnly />
        <NumberStepper label={t('harvest.looseFruit')} value={tk.looseFruitKg} onChange={noop} decimal readOnly />
      </Card>

      <Card padded>
        <View style={styles.summary}>
          <View style={{ flex: 1 }}>
            <Txt variant="small" style={{ color: colors.textMuted }}>{t('harvest.estKg')}</Txt>
            <Txt style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>{tk.estKg} kg</Txt>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Txt variant="small" style={{ color: colors.textMuted }}>{t('harvest.premi')}</Txt>
            <Txt style={{ fontSize: 22, fontWeight: '800', color: colors.success }}>{formatRupiah(premi.net)}</Txt>
            {premi.penalty > 0 && (
              <Txt variant="small" style={{ color: colors.danger }}>
                {t('harvest.penalty')} −{formatRupiah(premi.penalty)}
              </Txt>
            )}
          </View>
        </View>
      </Card>

      <EntryPhotos transactionUuid={tk.mobileUuid} photoIds={tk.photoId ? [tk.photoId] : []} />

      {correctable && (
        <Button
          kind={tk.status === 'rejected' ? 'primary' : 'outline'}
          icon="pencil"
          label={t('harvest.correction')}
          onPress={() => router.push({ pathname: '/harvest/new', params: { correctionOf: tk.mobileUuid } })}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
