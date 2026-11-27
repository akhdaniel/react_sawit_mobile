import { eq } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { canCorrect, ticketView } from '@/db/repositories/harvest';
import { latestConfirmFor, validateContinueTicket } from '@/db/repositories/verification';
import { harvestTicket } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { useVerifyLabel } from '@/features/entry/StageContinue';
import { reasonLabel } from '@/features/common/reason';
import { DocumentStatus } from '@/features/entry/DocumentStatus';
import { totalBunches } from '@/features/harvest/calc';
import { encodeTicketQr } from '@/features/harvest/qr';
import { continueTicket } from '@/features/harvest/stage';
import { printWithSavedPrinter, PrinterNotConfiguredError } from '@/features/transport/print';
import { buildTicketReceipt } from '@/features/transport/receipts';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export default function HarvestTicketScreen() {
  const refresh = useRefresh();
  const services = useServices();
  const { db } = services;
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const tk = useTableQuery(['harvest_ticket', 'spb_line', 'spb'], () => ticketView(db, id));
  const corrected = useTableQuery(['harvest_ticket'], () => !canCorrect(db, id));
  const originalNo = useTableQuery(['harvest_ticket'], () =>
    tk?.correctionOf ? (db.select({ n: harvestTicket.ticketNo }).from(harvestTicket).where(eq(harvestTicket.mobileUuid, tk.correctionOf)).get()?.n ?? null) : null,
  );

  const confirm = useTableQuery(['stage_confirm', id], () => latestConfirmFor(db, id));
  const userId = useSession((s) => s.user?.id ?? 0);
  const canContinue = useTableQuery(['stage_confirm', 'harvest_ticket', id, `user:${userId}`], () => validateContinueTicket(db, id, userId) === null);
  const verifier = useSession((s) => !!s.user?.roles.some((r) => r === 'mandor_panen' || r === 'kerani_panen'));

  const [printing, setPrinting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const verifyLabel = useVerifyLabel('panen');

  if (!tk) {
    return (
      <Screen refresh={refresh} title={t('harvest.detail')} back>
        <Txt>—</Txt>
      </Screen>
    );
  }

  const qr = encodeTicketQr({
    uuid: tk.mobileUuid,
    ticketNo: tk.ticketNo,
    blockCode: tk.blockCode,
    tphCode: tk.tphCode,
    bunches: totalBunches(tk),
    estKg: tk.estKg,
    workDate: tk.workDate,
    looseFruitKg: tk.looseFruitKg,
  });

  const print = async () => {
    setPrinting(true);
    try {
      await printWithSavedPrinter(
        db,
        buildTicketReceipt({
          ticketNo: tk.ticketNo,
          workDate: tk.workDate,
          blockCode: tk.blockCode,
          tphCode: tk.tphCode,
          harvesterName: tk.harvesterName,
          ripe: tk.ripe,
          unripe: tk.unripe,
          rotten: tk.rotten,
          looseFruitKg: tk.looseFruitKg,
          estKg: tk.estKg,
          lateEntry: tk.isLateEntry,
          qr,
        }),
      );
      Alert.alert(t('harvest.print'), t('transport.printed'));
    } catch (e) {
      if (e instanceof PrinterNotConfiguredError) router.push('/printer');
      else Alert.alert(t('harvest.print'), t('printer.failed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPrinting(false);
    }
  };

  const doContinue = async () => {
    setContinuing(true);
    try {
      const r = continueTicket(db, await services.txContext(), tk.mobileUuid);
      Alert.alert(verifyLabel, r.ok ? t('harvest.continueSaved') : t(`harvest.continueError.${r.code}`));
    } finally {
      setContinuing(false);
    }
  };

  const askContinue = () =>
    Alert.alert(t('harvest.continueTitle'), t('harvest.continueConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: verifyLabel, onPress: () => void doContinue() },
    ]);

  return (
    <Screen refresh={refresh} title={tk.ticketNo} subtitle={fresh ? t('harvest.saved', { no: tk.ticketNo }) : t('harvest.detail')} back>
      <Card padded style={{ alignItems: 'center' }}>
        <View style={styles.qr}>
          <QRCode value={qr} size={240} ecl="M" />
        </View>
        <Txt style={{ textAlign: 'center', color: colors.textMuted }}>{t('harvest.qrHint')}</Txt>
        <View style={styles.pills}>
          {tk.isLateEntry && <StatusPill label={t('harvest.lateEntry')} tone="warning" />}
          <StatusPill label={tk.transported ? t('harvest.transported') : t('harvest.notTransported')} tone={tk.transported ? 'success' : 'neutral'} />
          <StatusPill label={t(`status.${tk.status}`)} tone="primary" />
          {corrected && <StatusPill label={t('harvest.correctedBy')} tone="danger" />}
          {confirm && (
            <StatusPill
              label={t(`harvest.continueState.${confirm.status === 'draft' ? 'queued' : confirm.status}`, { reason: reasonLabel(confirm.rejectReason) })}
              tone={confirm.status === 'rejected' ? 'danger' : confirm.status === 'posted' ? 'success' : 'warning'}
            />
          )}
        </View>
      </Card>
      <Card>
        <ListRow icon="map-marker" label={`${t('harvest.block')} ${tk.blockCode} · ${t('harvest.tph')} ${tk.tphCode}`} />
        <ListRow icon="account-hard-hat" tone="accent" label={tk.harvesterName} />
        <ListRow icon="palm-tree" label={t('harvest.ripe')} value={String(tk.ripe)} />
        <ListRow icon="fruit-cherries" tone="accent" label={`${t('harvest.unripe')} / ${t('harvest.rotten')}`} value={`${tk.unripe} / ${tk.rotten}`} />
        <ListRow icon="weight-kilogram" label={t('harvest.estKg')} value={`${tk.estKg} kg`} />
        <ListRow icon="grain" tone="accent" label={t('harvest.looseFruit')} value={String(tk.looseFruitKg)} last={!originalNo} />
        {originalNo && <ListRow icon="history" tone="danger" label={t('harvest.correctionOf', { no: originalNo })} last />}
      </Card>
      <DocumentStatus mobileUuid={tk.mobileUuid} status={tk.status} />
      {verifier && canContinue && (
        <Button icon="check-decagram" label={verifyLabel} busy={continuing} onPress={askContinue} />
      )}
      <Button kind="outline" icon="form-select" label={t('entry.viewForm')} onPress={() => router.push({ pathname: '/harvest/entry/[id]', params: { id: tk.mobileUuid } })} />
      <Button kind="outline" icon="printer" label={t('harvest.print')} busy={printing} onPress={() => void print()} />
      {/* Tiket yang sudah dimuat SPB tidak bisa dikoreksi (server menolak ticket_already_transported). */}
      {!corrected && !tk.transported && (
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
  qr: { padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
});
