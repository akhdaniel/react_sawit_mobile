/**
 * SPB baru (struktur SPB ERP): kendaraan, sopir (karyawan untuk truk sendiri), PKS tujuan; tiket dari
 * pindai QR (HP mandor lain) atau tiket di HP ini, dengan muatan per tiket (janjang yang tidak dimuat
 * = restan); minimal 2 foto muatan. Langsir: parent = SPB induk, muatan induk ikut terbawa.
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
import { NumberStepper } from '@/components/NumberStepper';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { ticketViews } from '@/db/repositories/harvest';
import { spbLoadLines, spbTotals, type SpbTicket } from '@/db/repositories/transport';
import { employee, harvestTicket, pks, spb, vehicle } from '@/db/schema';
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
  const drivers = useTableQuery(['employee'], () => db.select().from(employee).where(eq(employee.role, 'sopir')).orderBy(asc(employee.name)).all());
  const mills = useTableQuery(['pks'], () => db.select().from(pks).orderBy(asc(pks.name)).all());

  // Langsir: tiket SPB induk ikut terbawa dengan muatan induknya (data tiket lokal bila ada).
  const initialTickets = useMemo<SpbTicket[]>(() => {
    if (!parentSpb) return [];
    return spbLoadLines(db, parentSpb.mobileUuid).map((line) => {
      const tk = db.select().from(harvestTicket).where(eq(harvestTicket.mobileUuid, line.harvestTicketUuid)).get();
      const bunches = tk ? totalBunches(tk) : (line.bunchCount ?? 0);
      return {
        uuid: line.harvestTicketUuid,
        ticketNo: tk?.ticketNo ?? line.harvestTicketUuid.slice(0, 8),
        blockCode: '',
        tphCode: '',
        bunches,
        estKg: tk?.estKg ?? 0,
        looseFruitKg: tk?.looseFruitKg ?? line.looseFruitKg ?? null,
        loadBunches: line.bunchCount ?? bunches,
        loadLooseKg: line.looseFruitKg ?? tk?.looseFruitKg ?? null,
      };
    });
  }, [parentSpb, db]);

  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [driver, setDriver] = useState(parentSpb?.driverName ?? '');
  const [driverEmployeeId, setDriverEmployeeId] = useState<number | null>(parentSpb?.driverEmployeeId ?? null);
  const [pksId, setPksId] = useState<number | null>(parentSpb?.pksId ?? null);
  const [transferPoint, setTransferPoint] = useState('');
  const [destination, setDestination] = useState<'internal_mill' | 'partner_mill'>(parentSpb?.destination ?? 'internal_mill');
  const [tickets, setTickets] = useState<SpbTicket[]>(initialTickets);
  const [editing, setEditing] = useState<string | null>(null);
  const ownVehicle = vehicles.find((v) => v.id === vehicleId)?.ownership === 'own';
  const effPksId = pksId ?? (mills.length === 1 ? mills[0]!.id : null);
  const editTicket = tickets.find((x) => x.uuid === editing) ?? null;
  const setLoad = (uuid: string, patch: Partial<Pick<SpbTicket, 'loadBunches' | 'loadLooseKg'>>) =>
    setTickets((cur) => cur.map((c) => (c.uuid === uuid ? { ...c, ...patch } : c)));
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
    addTicket({
      uuid: qr.uuid,
      ticketNo: qr.ticketNo,
      blockCode: qr.blockCode,
      tphCode: qr.tphCode,
      bunches: qr.bunches,
      estKg: qr.estKg,
      looseFruitKg: qr.looseFruitKg,
      loadBunches: qr.bunches,
      loadLooseKg: qr.looseFruitKg,
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = saveSpb(
        db,
        await services.txContext(),
        {
          workDate,
          vehicleId: vehicleId ?? 0,
          driverName: ownVehicle ? (drivers.find((d) => d.id === driverEmployeeId)?.name ?? '') : driver,
          driverEmployeeId: ownVehicle ? driverEmployeeId : null,
          pksId: effPksId,
          destination,
          parentSpbUuid: parentSpb?.mobileUuid ?? null,
          transferPoint: parentSpb ? transferPoint : null,
          tickets,
        },
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
        {ownVehicle ? (
          <>
            <Txt style={{ fontWeight: '700' }}>{t('transport.driverEmployee')}</Txt>
            {drivers.length === 0 ? (
              <Txt>{t('transport.noDriver')}</Txt>
            ) : (
              <View style={styles.wrap}>
                {drivers.map((d) => (
                  <Chip key={d.id} label={d.name} selected={d.id === driverEmployeeId} onPress={() => setDriverEmployeeId(d.id)} />
                ))}
              </View>
            )}
          </>
        ) : (
          <TextField label={t('transport.driver')} value={driver} onChangeText={setDriver} autoCapitalize="words" />
        )}
        {mills.length > 0 && (
          <>
            <Txt style={{ fontWeight: '700' }}>{t('transport.pks')}</Txt>
            <View style={styles.wrap}>
              {mills.map((m) => (
                <Chip key={m.id} label={m.name} selected={m.id === effPksId} onPress={() => setPksId(m.id)} />
              ))}
            </View>
          </>
        )}
        {parentSpb && <TextField label={t('transport.transferPoint')} value={transferPoint} onChangeText={setTransferPoint} />}
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
              description={`${tk.blockCode} ${tk.tphCode} · ${
                tk.bunches > 0 && tk.loadBunches < tk.bunches
                  ? t('transport.loadPartial', { loaded: tk.loadBunches, total: tk.bunches })
                  : `${tk.loadBunches} jjg`
              } · ${Math.round(tk.estKg)} kg`}
              last={i === tickets.length - 1}
              onPress={() => setEditing(tk.uuid)}
              value={t('transport.edit')}
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
                    : addTicket({
                        uuid: x.mobileUuid,
                        ticketNo: x.ticketNo,
                        blockCode: x.blockCode,
                        tphCode: x.tphCode,
                        bunches: totalBunches(x),
                        estKg: x.estKg,
                        looseFruitKg: x.looseFruitKg,
                        loadBunches: totalBunches(x),
                        loadLooseKg: x.looseFruitKg,
                      })
                }
              />
            ))}
          </Card>
        )}
      </Sheet>
      <Sheet visible={editTicket != null} title={t('transport.load', { no: editTicket?.ticketNo ?? '' })} onClose={() => setEditing(null)}>
        {editTicket && (
          <>
            <NumberStepper
              label={t('transport.loadBunches')}
              value={editTicket.loadBunches}
              onChange={(n) => setLoad(editTicket.uuid, { loadBunches: editTicket.bunches > 0 ? Math.min(n, editTicket.bunches) : n })}
              large
            />
            {editTicket.loadLooseKg != null && (
              <NumberStepper
                label={t('transport.loadLoose')}
                value={editTicket.loadLooseKg}
                onChange={(n) =>
                  setLoad(editTicket.uuid, { loadLooseKg: editTicket.looseFruitKg != null ? Math.min(n, editTicket.looseFruitKg) : n })
                }
                step={0.5}
                decimal
              />
            )}
            <Button
              kind="outline"
              icon="delete"
              label={t('transport.remove')}
              onPress={() => {
                setTickets((cur) => cur.filter((c) => c.uuid !== editTicket.uuid));
                setEditing(null);
              }}
            />
          </>
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
