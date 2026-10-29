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
import { harvestTicket } from '@/db/schema';
import { totalBunches } from '@/features/harvest/calc';
import { encodeTicketQr } from '@/features/harvest/qr';
import { printWithSavedPrinter, PrinterNotConfiguredError } from '@/features/transport/print';
import { buildTicketReceipt } from '@/features/transport/receipts';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export default function HarvestTicketScreen() {
  const { db } = useServices();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const tk = useTableQuery(['harvest_ticket', 'spb_line', 'spb'], () => ticketView(db, id));
  const corrected = useTableQuery(['harvest_ticket'], () => !canCorrect(db, id));
  const originalNo = useTableQuery(['harvest_ticket'], () =>
    tk?.correctionOf ? (db.select({ n: harvestTicket.ticketNo }).from(harvestTicket).where(eq(harvestTicket.mobileUuid, tk.correctionOf)).get()?.n ?? null) : null,
  );

  const [printing, setPrinting] = useState(false);

  if (!tk) {
    return (
      <Screen title={t('harvest.detail')} back>
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

  return (
    <Screen title={tk.ticketNo} subtitle={fresh ? t('harvest.saved', { no: tk.ticketNo }) : t('harvest.detail')} back>
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
      <Button kind="outline" icon="form-select" label={t('entry.viewForm')} onPress={() => router.push({ pathname: '/harvest/entry/[id]', params: { id: tk.mobileUuid } })} />
      <Button kind="outline" icon="printer" label={t('harvest.print')} busy={printing} onPress={() => void print()} />
      {!corrected && (
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
