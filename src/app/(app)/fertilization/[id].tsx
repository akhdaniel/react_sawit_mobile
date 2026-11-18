/** Tiket pemupukan tersimpan (append-only): rincian, dosis, estimasi upah, dokumen ERP, Lanjutkan, dan koreksi. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { getDocument } from '@/db/repositories/documents';
import { canCorrectFertilization, fertilizationEstimate, fertilizationView } from '@/db/repositories/fertilization';
import { latestConfirmFor, validateContinueTicket } from '@/db/repositories/verification';
import { useSession } from '@/features/auth/session-store';
import { reasonLabel } from '@/features/common/reason';
import { DocumentStatus } from '@/features/entry/DocumentStatus';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { formatRupiah } from '@/features/harvest/calc';
import { continueTicket } from '@/features/harvest/stage';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

/** Pupuk sudah keluar dari gudang: koreksi dari HP ditolak server (ticket_already_verified). */
const VERIFIED_STATES = ['verified', 'closed'];

export default function FertilizationTicketScreen() {
  const refresh = useRefresh();
  const services = useServices();
  const { db } = services;
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const tk = useTableQuery(['fertilization_ticket'], () => fertilizationView(db, id));
  const corrected = useTableQuery(['fertilization_ticket'], () => !canCorrectFertilization(db, id));
  const original = useTableQuery(['fertilization_ticket'], () => (tk?.correctionOf ? fertilizationView(db, tk.correctionOf) : null));
  const estimate = useTableQuery(['fertilization_ticket', 'harvest_rate', 'product', 'block', 'sub_blok', 'employee'], () =>
    tk ? fertilizationEstimate(db, tk) : null,
  );
  const verified = useTableQuery(['tx_document', id], () => VERIFIED_STATES.includes(getDocument(db, id)?.state ?? ''));
  const confirm = useTableQuery(['stage_confirm', id], () => latestConfirmFor(db, id));
  const canContinue = useTableQuery(['stage_confirm', 'fertilization_ticket', id], () =>
    validateContinueTicket(db, id, 'fertilization_ticket') === null,
  );
  const verifier = useSession((s) => !!s.user?.roles.some((r) => r === 'mandor_rawat' || r === 'kerani_rawat'));
  const [continuing, setContinuing] = useState(false);

  if (!tk || !estimate) {
    return (
      <Screen refresh={refresh} title={t('fertilization.detail')} back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }

  const doContinue = async () => {
    setContinuing(true);
    try {
      const r = continueTicket(db, await services.txContext(), tk.mobileUuid, 'fertilization_ticket');
      Alert.alert(t('harvest.continue'), r.ok ? t('harvest.continueSaved') : t(`harvest.continueError.${r.code}`));
    } finally {
      setContinuing(false);
    }
  };

  const askContinue = () =>
    Alert.alert(t('harvest.continueTitle'), t('harvest.continueConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('harvest.continue'), onPress: () => void doContinue() },
    ]);

  return (
    <Screen refresh={refresh} title={tk.workerName} subtitle={fresh ? t('fertilization.saved') : tk.workDate} back>
      <SavedEntryNotice status={tk.status} savedAt={tk.createdTrustedAt}>
        {corrected && <StatusPill label={t('fertilization.correctedBy')} tone="danger" />}
        {confirm && (
          <StatusPill
            label={t(`harvest.continueState.${confirm.status === 'draft' ? 'queued' : confirm.status}`, { reason: reasonLabel(confirm.rejectReason) })}
            tone={confirm.status === 'rejected' ? 'danger' : confirm.status === 'posted' ? 'success' : 'warning'}
          />
        )}
      </SavedEntryNotice>
      {tk.status === 'rejected' && tk.rejectReason && (
        <Card padded style={{ borderWidth: 2, borderColor: colors.danger }}>
          <Txt variant="small" style={{ color: colors.textMuted }}>{t('fertilization.rejectReason')}</Txt>
          <Txt style={{ fontWeight: '700' }}>{tk.rejectReason}</Txt>
        </Card>
      )}
      <Card>
        <ListRow icon="map-marker" label={`${t('fertilization.block')} ${tk.blockCode}${tk.subBlokCode ? ` / ${tk.subBlokCode}` : ''}`} />
        <ListRow icon="sack" tone="accent" label={tk.productName} value={t(`fertilization.methods.${tk.method}`)} />
        <ListRow icon="pine-tree" label={t('fertilization.trees')} value={String(tk.treeCount)} />
        <ListRow icon="weight-kilogram" tone="accent" label={t('fertilization.qty')} value={`${tk.qtyKg} kg`} />
        <ListRow
          icon="scale-balance"
          tone={estimate.dosageStatus === 'over' ? 'danger' : 'success'}
          label={t('fertilization.maxQty')}
          value={estimate.maxQtyKg != null ? `${estimate.maxQtyKg} kg` : '—'}
          description={t(`fertilization.dosageStatus.${estimate.dosageStatus}`)}
        />
        {tk.applicationRound != null && <ListRow icon="repeat" label={t('fertilization.round')} value={String(tk.applicationRound)} />}
        {tk.weather && <ListRow icon="weather-partly-cloudy" label={t('fertilization.weather')} value={t(`fertilization.weathers.${tk.weather}`)} />}
        {tk.notes && <ListRow icon="note-text" label={tk.notes} />}
        <ListRow
          icon="cash"
          tone="success"
          label={t('fertilization.wage')}
          value={formatRupiah(estimate.wage.amount)}
          last={!original}
        />
        {original && (
          <ListRow
            icon="history"
            tone="danger"
            label={t('fertilization.correctionOf', { worker: original.workerName, block: original.blockCode })}
            last
          />
        )}
      </Card>

      <DocumentStatus mobileUuid={tk.mobileUuid} status={tk.status} />

      <View style={styles.actions}>
        {verifier && canContinue && (
          <Button icon="check-decagram" label={t('harvest.continue')} busy={continuing} onPress={askContinue} />
        )}
        {!corrected && !verified && (
          <Button
            kind={tk.status === 'rejected' ? 'primary' : 'outline'}
            icon="pencil"
            label={t('fertilization.correction')}
            onPress={() => router.push({ pathname: '/fertilization/new', params: { correctionOf: tk.mobileUuid } })}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
});
