/** SPB tersimpan: form entry yang sama (kendaraan, sopir, tujuan, tiket, foto), tidak bisa diubah. */
import { eq, inArray } from 'drizzle-orm';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { spbLines } from '@/db/repositories/transport';
import { harvestTicket, spb, vehicle } from '@/db/schema';
import { EntryPhotos } from '@/features/entry/EntryPhotos';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { totalBunches } from '@/features/harvest/calc';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

export default function SpbEntryScreen() {
  const { db } = useServices();
  const { id } = useLocalSearchParams<{ id: string }>();
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

  if (!row) {
    return (
      <Screen title="SPB" back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }

  return (
    <Screen title={row.spbNo} subtitle={row.workDate} back>
      <SavedEntryNotice status={row.status} savedAt={row.createdTrustedAt}>
        {parentNo && <StatusPill label={t('transport.langsirOf', { no: parentNo })} tone="warning" />}
      </SavedEntryNotice>

      <SectionTitle>{t('transport.vehicle')}</SectionTitle>
      <View style={styles.wrap}>
        <Chip label={plate || `#${row.vehicleId}`} selected />
      </View>
      <Card padded>
        <TextField label={t('transport.driver')} value={row.driverName} editable={false} />
        <Txt style={{ fontWeight: '700' }}>{t('transport.destination')}</Txt>
        <View style={styles.wrap}>
          <Chip label={t('transport.internal_mill')} selected={row.destination === 'internal_mill'} />
          <Chip label={t('transport.partner_mill')} selected={row.destination === 'partner_mill'} />
        </View>
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
      <View style={styles.total}>
        <Icon name="sigma" size={24} color={colors.primary} />
        <Txt style={{ fontWeight: '800', fontSize: 20 }}>{t('transport.total', { bunches: row.totalBunch, kg: Math.round(row.estKg) })}</Txt>
      </View>

      <EntryPhotos photoIds={row.photoIds} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  total: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
});
