import { eq, inArray } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { spbLines } from '@/db/repositories/transport';
import { harvestTicket, spb, vehicle } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { totalBunches } from '@/features/harvest/calc';
import { encodeSpbQr } from '@/features/transport/actions';
import { printWithSavedPrinter, PrinterNotConfiguredError } from '@/features/transport/print';
import { buildSpbReceipt } from '@/features/transport/receipts';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { spacing } from '@/theme';

export default function SpbDetailScreen() {
  const { db } = useServices();
  const user = useSession((s) => s.user);
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const row = useTableQuery(['spb'], () => db.select().from(spb).where(eq(spb.mobileUuid, id)).get() ?? null);
  const plate = useTableQuery(['vehicle', 'spb'], () => (row ? (db.select().from(vehicle).where(eq(vehicle.id, row.vehicleId)).get()?.plate ?? '') : ''));
  const parentNo = useTableQuery(['spb'], () =>
    row?.parentSpbUuid ? (db.select({ n: spb.spbNo }).from(spb).where(eq(spb.mobileUuid, row.parentSpbUuid)).get()?.n ?? null) : null,
  );
  const lines = useTableQuery(['spb_line', 'harvest_ticket'], () => {
    const uuids = spbLines(db, id);
    const known = new Map(
      (uuids.length ? db.select().from(harvestTicket).where(inArray(harvestTicket.mobileUuid, uuids)).all() : []).map((x) => [x.mobileUuid, x]),
    );
    return uuids.map((u) => ({ uuid: u, ticket: known.get(u) ?? null }));
  });
  const [printing, setPrinting] = useState(false);

  if (!row) {
    return (
      <Screen title="SPB" back>
        <Txt>—</Txt>
      </Screen>
    );
  }
  const qr = encodeSpbQr(row);

  const print = async () => {
    setPrinting(true);
    try {
      await printWithSavedPrinter(
        db,
        buildSpbReceipt({
          spbNo: row.spbNo,
          workDate: row.workDate,
          createdAt: new Date(row.createdTrustedAt).toLocaleString('id-ID'),
          vehiclePlate: plate,
          driverName: row.driverName,
          destination: t(`transport.${row.destination}`),
          parentSpbNo: parentNo,
          tickets: lines.map((l) => ({
            ticketNo: l.ticket?.ticketNo ?? l.uuid.slice(0, 8),
            blockCode: '',
            bunches: l.ticket ? totalBunches(l.ticket) : 0,
            estKg: l.ticket?.estKg ?? 0,
          })),
          totalBunch: row.totalBunch,
          estKg: row.estKg,
          clerkName: user?.name ?? '',
          qr,
        }),
      );
      Alert.alert(t('transport.print'), t('transport.printed'));
    } catch (e) {
      if (e instanceof PrinterNotConfiguredError) router.push('/printer');
      else Alert.alert(t('transport.print'), t('printer.failed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Screen title={row.spbNo} subtitle={fresh ? t('transport.saved', { no: row.spbNo }) : undefined} back>
      <Card padded style={{ alignItems: 'center' }}>
        <View style={styles.qr}>
          <QRCode value={qr} size={200} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <StatusPill label={t(`status.${row.status}`)} tone="primary" />
          {parentNo && <StatusPill label={t('transport.langsirOf', { no: parentNo })} tone="warning" />}
        </View>
      </Card>
      <Card>
        <ListRow icon="truck" label={plate} description={row.driverName} />
        <ListRow icon="factory" tone="accent" label={t('transport.destination')} value={t(`transport.${row.destination}`)} />
        <ListRow icon="sigma" label={t('transport.total', { bunches: row.totalBunch, kg: Math.round(row.estKg) })} last />
      </Card>
      <SectionTitle>{t('transport.tickets', { count: lines.length })}</SectionTitle>
      <Card>
        {lines.map((l, i) => (
          <ListRow
            key={l.uuid}
            icon="ticket-confirmation"
            label={l.ticket?.ticketNo ?? l.uuid}
            description={l.ticket ? `${totalBunches(l.ticket)} jjg · ${Math.round(l.ticket.estKg)} kg` : undefined}
            last={i === lines.length - 1}
          />
        ))}
      </Card>
      <Button icon="printer" label={t('transport.print')} busy={printing} onPress={() => void print()} />
      <Button kind="outline" icon="truck-delivery" label={t('transport.langsir')} onPress={() => router.push({ pathname: '/transport/new', params: { parent: row.mobileUuid } })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: 12 },
});
