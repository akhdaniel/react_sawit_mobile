/**
 * Tiket Menunggu Verifikasi — tiket panen ERP yang tahap berikutnya milik user ini (mandor: verifikasi mandor,
 * kerani: verifikasi kerani), termasuk tiket dari HP lain. Bekerja offline dari antrean yang ditarik saat
 * sinkron; Lanjutkan disimpan sebagai transaksi stage_confirm dan dikirim saat sinkron.
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
import { pendingVerifications, type VerificationRow } from '@/db/repositories/verification';
import { continueQueued } from '@/features/harvest/stage';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

const bunches = (r: VerificationRow) => r.ripe + r.unripe + r.rotten;

export default function VerificationScreen() {
  const refresh = useRefresh();
  const services = useServices();
  const { db } = services;
  const items = useTableQuery(['verification_queue', 'stage_confirm'], () => pendingVerifications(db));
  const [open, setOpen] = useState<VerificationRow | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const r = continueQueued(db, await services.txContext(), open.coreTicketId);
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

  const rows: [string, string][] = open
    ? [
        [t('verification.stage'), open.stage ?? '—'],
        [t('harvest.block'), `${open.blockCode} · ${t('harvest.tph')} ${open.tphCode}`],
        ...(open.subBlokName ? [[t('harvest.subBlok'), open.subBlokName] as [string, string]] : []),
        [t('harvest.ripe'), String(open.ripe)],
        [`${t('harvest.unripe')} / ${t('harvest.rotten')}`, `${open.unripe} / ${open.rotten}`],
        [`${t('harvest.emptyBunch')} / ${t('harvest.longStalk')}`, `${open.emptyBunch} / ${open.longStalk}`],
        [t('harvest.looseFruit'), String(open.looseFruitKg)],
        ...(open.gangName ? [[t('verification.gang'), open.gangName] as [string, string]] : []),
        ...(open.createdBy ? [[t('verification.createdBy'), open.createdBy] as [string, string]] : []),
        [t('verification.photo'), open.hasPhoto ? t('verification.photoYes') : t('verification.photoNo')],
      ]
    : [];

  return (
    <Screen refresh={refresh} title={t('verification.title')} back>
      <Txt style={{ color: colors.textMuted }}>{t('verification.hint')}</Txt>
      <SectionTitle>{t('verification.count', { count: items.length })}</SectionTitle>
      {items.length === 0 ? (
        <Card padded>
          <Txt>{t('verification.empty')}</Txt>
        </Card>
      ) : (
        <Card>
          {items.map((i, n) => (
            <ListRow
              key={i.coreTicketId}
              icon="palm-tree"
              tone={i.isLateEntry ? 'danger' : 'accent'}
              label={`${i.name} · ${i.harvesterName}`}
              description={`${i.workDate} · ${t('harvest.block')} ${i.blockCode} · ${t('harvest.tph')} ${i.tphCode} · ${bunches(i)} jjg · ${i.stage ?? ''}`}
              last={n === items.length - 1}
              onPress={() => setOpen(i)}
            />
          ))}
        </Card>
      )}

      <Sheet visible={!!open} title={open ? `${open.name} · ${open.harvesterName}` : ''} onClose={() => setOpen(null)}>
        {open && (
          <>
            {open.isLateEntry && (
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
