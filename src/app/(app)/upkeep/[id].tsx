/** Perawatan tersimpan: form entry yang sama (kegiatan, blok, pekerja, HK, material), tidak bisa diubah. */
import { eq, inArray } from 'drizzle-orm';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { NumberStepper } from '@/components/NumberStepper';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { doseLimitsFor } from '@/db/repositories/upkeep';
import { activity, block, employee, materialUsage, product, upkeep } from '@/db/schema';
import { EntryPhotos } from '@/features/entry/EntryPhotos';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { formatRupiah } from '@/features/harvest/calc';
import { upkeepWageEstimate } from '@/features/upkeep/calc';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

const noop = () => {};

export default function UpkeepEntryScreen() {
  const { db } = useServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const row = useTableQuery(['upkeep'], () => db.select().from(upkeep).where(eq(upkeep.mobileUuid, id)).get() ?? null);
  const refs = useTableQuery(['activity', 'block', 'employee', 'material_usage', 'product', 'dosage_rule', 'upkeep'], () => {
    if (!row) return null;
    const mats = db.select().from(materialUsage).where(eq(materialUsage.upkeepUuid, row.mobileUuid)).all();
    const prods = new Map(
      (mats.length ? db.select().from(product).where(inArray(product.id, mats.map((m) => m.productId))).all() : []).map((p) => [p.id, p.name]),
    );
    return {
      act: db.select().from(activity).where(eq(activity.id, row.activityId)).get() ?? null,
      blk: db.select().from(block).where(eq(block.id, row.blockId)).get() ?? null,
      workers: row.employeeIds.length ? db.select().from(employee).where(inArray(employee.id, row.employeeIds)).all() : [],
      materials: mats.map((m) => ({ ...m, productName: prods.get(m.productId) ?? `#${m.productId}` })),
      limits: doseLimitsFor(db, row.activityId, row.realizedHa),
    };
  });

  if (!row || !refs) {
    return (
      <Screen title={t('upkeep.title')} back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }
  const wage = upkeepWageEstimate(refs.act, { hk: row.hk, realizedHa: row.realizedHa, realizedTrees: row.realizedTrees });

  return (
    <Screen title={t('upkeep.title')} subtitle={row.workDate} back>
      <SavedEntryNotice status={row.status} savedAt={row.createdTrustedAt} />

      <SectionTitle>{t('upkeep.activity')}</SectionTitle>
      <View style={styles.wrap}>
        <Chip label={refs.act?.name ?? `#${row.activityId}`} selected />
      </View>

      <SectionTitle>{`${t('upkeep.block')}${refs.blk ? ` · ${t('upkeep.blockHa', { ha: refs.blk.ha })}` : ''}`}</SectionTitle>
      <View style={styles.wrap}>
        <Chip label={refs.blk?.code ?? String(row.blockId)} selected />
      </View>

      <SectionTitle>{`${t('upkeep.workers')} (${refs.workers.length})`}</SectionTitle>
      <Card>
        {refs.workers.map((w, i) => (
          <ListRow key={w.id} icon="checkbox-marked" tone="success" label={w.name} description={`${w.nik} · ${w.type}`} last={i === refs.workers.length - 1} />
        ))}
      </Card>

      <Card padded>
        <NumberStepper label={t('upkeep.hk')} value={row.hk} onChange={noop} decimal readOnly />
        {row.realizedHa != null && <NumberStepper label={t('upkeep.realizedHa')} value={row.realizedHa} onChange={noop} decimal readOnly />}
        {row.realizedTrees != null && <NumberStepper label={t('upkeep.realizedTrees')} value={row.realizedTrees} onChange={noop} readOnly />}
      </Card>

      <SectionTitle>{t('upkeep.materials')}</SectionTitle>
      {refs.materials.length === 0 ? (
        <Card padded>
          <Txt>—</Txt>
        </Card>
      ) : (
        refs.materials.map((m) => {
          const limit = refs.limits.get(m.productId) ?? null;
          return (
            <Card key={m.mobileUuid} padded style={m.overDose ? { borderWidth: 2, borderColor: colors.danger } : undefined}>
              <NumberStepper label={`${m.productName} (${m.uom})`} value={m.qty} onChange={noop} decimal readOnly />
              <Txt variant="small" style={{ color: colors.textMuted }}>
                {limit ? t('upkeep.standard', { std: limit.standard, max: limit.max, uom: m.uom }) : t('upkeep.noLimit')}
              </Txt>
              {m.overDose && (
                <>
                  <View style={styles.over}>
                    <Txt style={{ color: colors.onDanger, fontWeight: '800' }}>{t('upkeep.overDose')}</Txt>
                  </View>
                  <TextField label={t('upkeep.note')} value={m.approvalNote ?? ''} editable={false} />
                </>
              )}
            </Card>
          );
        })
      )}

      <Card padded>
        <Txt variant="small" style={{ color: colors.textMuted }}>{t('upkeep.wage')}</Txt>
        <Txt style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{formatRupiah(wage)}</Txt>
      </Card>

      <EntryPhotos transactionUuid={row.mobileUuid} photoIds={row.photoId ? [row.photoId] : []} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  over: { backgroundColor: colors.danger, padding: spacing.sm, borderRadius: radius.sm },
});
