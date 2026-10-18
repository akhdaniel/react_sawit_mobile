/**
 * SPB baru: kendaraan, sopir, tujuan; tiket dari pindai QR (HP mandor lain) atau tiket di
 * HP ini; minimal 2 foto muatan. Langsir: parent = SPB induk, tiket induk ikut terbawa.
 */
import { asc, eq } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { ticketViews } from '@/db/repositories/harvest';
import { spbLines, spbTotals, type SpbTicket } from '@/db/repositories/transport';
import { harvestTicket, spb, vehicle } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { CameraCapture, type CapturedPhoto } from '@/features/camera/CameraCapture';
import { totalBunches } from '@/features/harvest/calc';
import { parseTicketQr } from '@/features/harvest/qr';
import { saveSpb } from '@/features/transport/actions';
import { QrScanner } from '@/features/transport/QrScanner';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

export default function NewSpbScreen() {
  const services = useServices();
  const { db, clock } = services;
  const workDate = clock.workDate();
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);
  const { parent } = useLocalSearchParams<{ parent?: string }>();

  const parentSpb = useMemo(() => (parent ? (db.select().from(spb).where(eq(spb.mobileUuid, parent)).get() ?? null) : null), [parent, db]);
  const vehicles = useTableQuery(['vehicle'], () => db.select().from(vehicle).orderBy(asc(vehicle.plate)).all());

  // Langsir: tiket SPB induk ikut terbawa (data tiket lokal bila ada).
  const initialTickets = useMemo<SpbTicket[]>(() => {
    if (!parentSpb) return [];
    return spbLines(db, parentSpb.mobileUuid).map((u) => {
      const tk = db.select().from(harvestTicket).where(eq(harvestTicket.mobileUuid, u)).get();
      return tk
        ? { uuid: u, ticketNo: tk.ticketNo, blockCode: '', tphCode: '', bunches: totalBunches(tk), estKg: tk.estKg }
        : { uuid: u, ticketNo: u.slice(0, 8), blockCode: '', tphCode: '', bunches: 0, estKg: 0 };
    });
  }, [parentSpb, db]);

  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [driver, setDriver] = useState(parentSpb?.driverName ?? '');
  const [destination, setDestination] = useState<'internal_mill' | 'partner_mill'>(parentSpb?.destination ?? 'internal_mill');
  const [tickets, setTickets] = useState<SpbTicket[]>(initialTickets);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [camera, setCamera] = useState(false);
  const [lastScan, setLastScan] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // Totals: untuk langsir tanpa data tiket lokal, pakai total induk.
  const totals = tickets.some((x) => x.bunches > 0) || !parentSpb ? spbTotals(tickets) : { totalBunch: parentSpb.totalBunch, estKg: parentSpb.estKg };
  const localOpen = useTableQuery(['harvest_ticket', 'spb_line', 'spb', String(picking)], () =>
    picking ? ticketViews(db, workDate).filter((x) => !x.transported && x.status !== 'rejected') : [],
  );

  const addTicket = (tk: SpbTicket) => {
    setTickets((cur) => {
      if (cur.some((c) => c.uuid === tk.uuid)) {
        setLastScan(t('transport.scanDuplicate', { no: tk.ticketNo }));
        return cur;
      }
      setLastScan(t('transport.scanned', { no: tk.ticketNo }));
      return [...cur, tk];
    });
  };

  const onCode = (raw: string) => {
    const qr = parseTicketQr(raw);
    if (!qr) {
      setLastScan(t('transport.scanInvalid'));
      return;
    }
    addTicket({ uuid: qr.uuid, ticketNo: qr.ticketNo, blockCode: qr.blockCode, tphCode: qr.tphCode, bunches: qr.bunches, estKg: qr.estKg });
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = saveSpb(
        db,
        await services.txContext(),
        { workDate, vehicleId: vehicleId ?? 0, driverName: driver, destination, parentSpbUuid: parentSpb?.mobileUuid ?? null, tickets },
        photos,
        services.device.deviceShort,
        afdelingIds,
      );
      if (!r.ok) {
        Alert.alert(t('transport.title'), r.issues.map((i) => `• ${t(`transport.error.${i.code}`, { tickets: (i.tickets ?? []).join(', ') })}`).join('\n'));
        return;
      }
      router.replace({ pathname: '/transport/[id]', params: { id: r.mobileUuid, fresh: '1' } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('transport.new')} subtitle={parentSpb ? t('transport.langsirOf', { no: parentSpb.spbNo }) : undefined} back>
      <SectionTitle>{t('transport.vehicle')}</SectionTitle>
      {vehicles.length === 0 ? (
        <Card padded>
          <Txt>{t('transport.noVehicle')}</Txt>
        </Card>
      ) : (
        <View style={styles.wrap}>
          {vehicles.map((v) => (
            <Chip key={v.id} label={v.plate} selected={v.id === vehicleId} onPress={() => setVehicleId(v.id)} />
          ))}
        </View>
      )}
      <Card padded>
        <TextField label={t('transport.driver')} value={driver} onChangeText={setDriver} autoCapitalize="words" />
        <Txt style={{ fontWeight: '700' }}>{t('transport.destination')}</Txt>
        <View style={styles.wrap}>
          <Chip label={t('transport.internal_mill')} selected={destination === 'internal_mill'} onPress={() => setDestination('internal_mill')} />
          <Chip label={t('transport.partner_mill')} selected={destination === 'partner_mill'} onPress={() => setDestination('partner_mill')} />
        </View>
      </Card>

      <SectionTitle>{t('transport.tickets', { count: tickets.length })}</SectionTitle>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Button icon="qrcode-scan" label={t('transport.scan')} onPress={() => setScanning(true)} />
        </View>
      </View>
      <Button kind="outline" icon="format-list-checks" label={t('transport.pickLocal')} onPress={() => setPicking(true)} />
      {tickets.length > 0 && (
        <Card>
          {tickets.map((tk, i) => (
            <ListRow
              key={tk.uuid}
              icon="ticket-confirmation"
              label={tk.ticketNo}
              description={`${tk.blockCode} ${tk.tphCode} · ${tk.bunches} jjg · ${Math.round(tk.estKg)} kg`}
              last={i === tickets.length - 1}
              onPress={() => setTickets((cur) => cur.filter((c) => c.uuid !== tk.uuid))}
              value={t('transport.remove')}
            />
          ))}
        </Card>
      )}
      <View style={styles.total}>
        <Icon name="sigma" size={24} color={colors.primary} />
        <Txt style={{ fontWeight: '800', fontSize: 20 }}>{t('transport.total', { bunches: totals.totalBunch, kg: Math.round(totals.estKg) })}</Txt>
      </View>

      <SectionTitle>{t('transport.photos', { count: photos.length })}</SectionTitle>
      <Button kind="outline" icon="camera-plus" label={t('transport.addPhoto')} onPress={() => setCamera(true)} />

      <Button icon="content-save" label={t('transport.save')} busy={busy} disabled={tickets.length === 0 || photos.length < 2 || !vehicleId} onPress={() => void save()} />

      <QrScanner
        visible={scanning}
        title={t('transport.scanTitle')}
        footer={lastScan ? `${lastScan} · ${t('transport.scanDone', { count: tickets.length })}` : t('transport.scanDone', { count: tickets.length })}
        onCode={onCode}
        onClose={() => setScanning(false)}
      />
      <Sheet visible={picking} title={t('transport.pickLocal')} onClose={() => setPicking(false)}>
        {localOpen.length === 0 ? (
          <Txt>{t('transport.noLocalTickets')}</Txt>
        ) : (
          <Card>
            {localOpen.map((x, i) => (
              <ListRow
                key={x.mobileUuid}
                icon={tickets.some((c) => c.uuid === x.mobileUuid) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                tone={tickets.some((c) => c.uuid === x.mobileUuid) ? 'success' : 'primary'}
                label={x.ticketNo}
                description={`${x.blockCode} ${x.tphCode} · ${x.harvesterName} · ${totalBunches(x)} jjg`}
                last={i === localOpen.length - 1}
                onPress={() =>
                  tickets.some((c) => c.uuid === x.mobileUuid)
                    ? setTickets((cur) => cur.filter((c) => c.uuid !== x.mobileUuid))
                    : addTicket({ uuid: x.mobileUuid, ticketNo: x.ticketNo, blockCode: x.blockCode, tphCode: x.tphCode, bunches: totalBunches(x), estKg: x.estKg })
                }
              />
            ))}
          </Card>
        )}
      </Sheet>
      <CameraCapture
        visible={camera}
        title={t('transport.addPhoto')}
        onCaptured={(p) => {
          setPhotos((cur) => [...cur, p]);
          setCamera(false);
        }}
        onCancel={() => setCamera(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
  total: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
});
