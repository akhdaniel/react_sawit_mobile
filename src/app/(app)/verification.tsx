/**
 * Tiket Menunggu Verifikasi — tiket panen, pemupukan, dan perawatan ERP yang tahap berikutnya milik user ini (mandor:
 * verifikasi mandor, kerani: verifikasi kerani), termasuk tiket dari HP lain. Bekerja offline dari antrean yang
 * ditarik saat sinkron; Lanjutkan disimpan sebagai transaksi stage_confirm dan dikirim saat sinkron.
 */
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import {
  pendingFertilizationVerifications,
  pendingMaintenanceVerifications,
  pendingVerifications,
  type FertilizationVerificationRow,
  type MaintenanceVerificationRow,
  type VerificationRow,
} from '@/db/repositories/verification';
import { continueQueued } from '@/features/harvest/stage';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import type { MaintenanceWorkType } from '@/sync/contract';
import { colors, spacing } from '@/theme';

const bunches = (r: VerificationRow) => r.ripe + r.unripe + r.rotten;

type Open =
  | { type: 'harvest_ticket'; row: VerificationRow }
  | { type: 'fertilization_ticket'; row: FertilizationVerificationRow }
  | { type: 'maintenance_ticket'; row: MaintenanceVerificationRow };

function harvestRows(r: VerificationRow): [string, string][] {
  return [
    [t('verification.stage'), r.stage ?? '—'],
    [t('harvest.block'), `${r.blockCode} · ${t('harvest.tph')} ${r.tphCode}`],
    ...(r.subBlokName ? [[t('harvest.subBlok'), r.subBlokName] as [string, string]] : []),
    [t('harvest.ripe'), String(r.ripe)],
    [`${t('harvest.unripe')} / ${t('harvest.rotten')}`, `${r.unripe} / ${r.rotten}`],
    [`${t('harvest.emptyBunch')} / ${t('harvest.longStalk')}`, `${r.emptyBunch} / ${r.longStalk}`],
    [t('harvest.looseFruit'), String(r.looseFruitKg)],
    ...(r.gangName ? [[t('verification.gang'), r.gangName] as [string, string]] : []),
    ...(r.createdBy ? [[t('verification.createdBy'), r.createdBy] as [string, string]] : []),
    [t('verification.photo'), r.hasPhoto ? t('verification.photoYes') : t('verification.photoNo')],
  ];
}

function fertilizationRows(r: FertilizationVerificationRow): [string, string][] {
  return [
    [t('verification.stage'), r.stage ?? '—'],
    [t('fertilization.block'), r.subBlokName ? `${r.blockCode} / ${r.subBlokName}` : r.blockCode],
    [t('fertilization.fertilizer'), r.fertilizerName],
    [t('fertilization.method'), t(`fertilization.methods.${r.method}`)],
    [t('fertilization.trees'), String(r.treeCount)],
    [t('fertilization.qty'), `${r.qtyKg} kg`],
    ...(r.applicationRound != null ? [[t('fertilization.round'), String(r.applicationRound)] as [string, string]] : []),
    ...(r.gangName ? [[t('verification.gang'), r.gangName] as [string, string]] : []),
    ...(r.createdBy ? [[t('verification.createdBy'), r.createdBy] as [string, string]] : []),
  ];
}

function maintenanceRows(r: MaintenanceVerificationRow): [string, string][] {
  return [
    [t('verification.stage'), r.stage ?? '—'],
    [t('fertilization.block'), r.subBlokName ? `${r.blockCode} / ${r.subBlokName}` : r.blockCode],
    [t('maintenance.workType'), t(`maintenance.workTypes.${r.workType as MaintenanceWorkType}`)],
    [t('maintenance.areaHa'), String(r.areaHa)],
    [t('maintenance.trees'), String(r.treeCount)],
    [t('maintenance.hk'), String(r.hk)],
    ...r.materials.map((m) => [`${t('verification.materials')} · ${m.name}`, `${m.qty} ${m.uom}`] as [string, string]),
    ...(r.gangName ? [[t('verification.gang'), r.gangName] as [string, string]] : []),
    ...(r.createdBy ? [[t('verification.createdBy'), r.createdBy] as [string, string]] : []),
  ];
}

export default function VerificationScreen() {
  const refresh = useRefresh();
  const services = useServices();
  const { db } = services;
  const harvest = useTableQuery(['verification_queue', 'stage_confirm'], () => pendingVerifications(db));
  const fertilization = useTableQuery(['fertilization_verification_queue', 'stage_confirm'], () =>
    pendingFertilizationVerifications(db),
  );
  const maintenance = useTableQuery(['maintenance_verification_queue', 'stage_confirm'], () => pendingMaintenanceVerifications(db));
  const total = harvest.length + fertilization.length + maintenance.length;
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const r = continueQueued(db, await services.txContext(), open.row.coreTicketId, open.type);
      if (!r.ok) {
        Alert.alert(t('verification.title'), t(`harvest.continueError.${r.code}`));
        return;
      }
      setOpen(null);
      Alert.alert(t('verification.title'), t('harvest.continueSaved'));
    } finally {
      setBusy(false);
    }
  };

  const rows = !open
    ? []
    : open.type === 'harvest_ticket'
      ? harvestRows(open.row)
      : open.type === 'fertilization_ticket'
        ? fertilizationRows(open.row)
        : maintenanceRows(open.row);
  const title = !open
    ? ''
    : `${open.row.name} · ${open.type === 'harvest_ticket' ? open.row.harvesterName : open.row.workerName}`;

  return (
    <Screen refresh={refresh} title={t('verification.title')} back>
      <Txt style={{ color: colors.textMuted }}>{t('verification.hint')}</Txt>
      <SectionTitle>{t('verification.count', { count: total })}</SectionTitle>
      {total === 0 && (
        <Card padded>
          <Txt>{t('verification.empty')}</Txt>
        </Card>
      )}
      {harvest.length > 0 && (
        <>
          <SectionTitle>{t('verification.harvest')}</SectionTitle>
          <Card>
            {harvest.map((i, n) => (
              <ListRow
                key={i.coreTicketId}
                icon="palm-tree"
                tone={i.isLateEntry ? 'danger' : 'accent'}
                label={`${i.name} · ${i.harvesterName}`}
                description={`${i.workDate} · ${t('harvest.block')} ${i.blockCode} · ${t('harvest.tph')} ${i.tphCode} · ${bunches(i)} jjg · ${i.stage ?? ''}`}
                last={n === harvest.length - 1}
                onPress={() => setOpen({ type: 'harvest_ticket', row: i })}
              />
            ))}
          </Card>
        </>
      )}
      {fertilization.length > 0 && (
        <>
          <SectionTitle>{t('verification.fertilization')}</SectionTitle>
          <Card>
            {fertilization.map((i, n) => (
              <ListRow
                key={i.coreTicketId}
                icon="sack"
                tone="accent"
                label={`${i.name} · ${i.workerName}`}
                description={`${i.workDate} · ${t('fertilization.block')} ${i.blockCode} · ${i.fertilizerName} · ${i.qtyKg} kg · ${i.stage ?? ''}`}
                last={n === fertilization.length - 1}
                onPress={() => setOpen({ type: 'fertilization_ticket', row: i })}
              />
            ))}
          </Card>
        </>
      )}
      {maintenance.length > 0 && (
        <>
          <SectionTitle>{t('verification.maintenance')}</SectionTitle>
          <Card>
            {maintenance.map((i, n) => (
              <ListRow
                key={i.coreTicketId}
                icon="sprout"
                tone="accent"
                label={`${i.name} · ${i.workerName}`}
                description={`${i.workDate} · ${t('fertilization.block')} ${i.blockCode} · ${t(`maintenance.workTypes.${i.workType as MaintenanceWorkType}`)} · ${i.stage ?? ''}`}
                last={n === maintenance.length - 1}
                onPress={() => setOpen({ type: 'maintenance_ticket', row: i })}
              />
            ))}
          </Card>
        </>
      )}

      <Sheet visible={!!open} title={title} onClose={() => setOpen(null)}>
        {open && (
          <>
            {open.type === 'harvest_ticket' && open.row.isLateEntry && (
              <View style={styles.pills}>
                <StatusPill label={t('harvest.lateEntry')} tone="warning" />
              </View>
            )}
            {rows.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Txt style={{ flex: 1, color: colors.textMuted }}>{label}</Txt>
                <Txt style={{ fontWeight: '700' }}>{value}</Txt>
              </View>
            ))}
            <Button icon="check-decagram" label={t('harvest.continue')} busy={busy} onPress={() => void submit()} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
});
