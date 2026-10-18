import { inArray } from 'drizzle-orm';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { isAfterRestanCutoff, potentialRestan, spbsFor } from '@/db/repositories/transport';
import { vehicle } from '@/db/schema';
import { t } from '@/i18n/id';
import { appConfig } from '@/lib/config';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

export default function TransportListScreen() {
  const { db, clock } = useServices();
  const workDate = clock.workDate();
  const spbs = useTableQuery(['spb'], () => spbsFor(db, workDate));
  const plates = useTableQuery(['vehicle', 'spb'], () =>
    spbs.length ? new Map(db.select().from(vehicle).where(inArray(vehicle.id, spbs.map((s) => s.vehicleId))).all().map((v) => [v.id, v.plate])) : new Map<number, string>(),
  );
  const restan = useTableQuery(['harvest_ticket', 'spb', 'spb_line'], () => potentialRestan(db, workDate));
  const late = isAfterRestanCutoff(clock.now().ms, clock.utcOffsetMinutes, appConfig.restanCutoff);

  return (
    <Screen title={t('transport.title')} back>
      <Button icon="truck-plus" label={t('transport.new')} onPress={() => router.push('/transport/new')} />
      {restan.length > 0 && (
        <View style={[styles.notice, { backgroundColor: late ? colors.dangerSoft : colors.warningSoft, borderLeftColor: late ? colors.danger : colors.warning }]}>
          <Icon name="alert" size={24} color={late ? colors.danger : colors.text} />
          <Txt style={{ flex: 1, fontWeight: '700' }}>
            {late ? `${t('transport.restanTitle')}: ` : ''}
            {t('transport.restanHint', { count: restan.length })}
          </Txt>
        </View>
      )}
      <SectionTitle>{t('transport.today')}</SectionTitle>
      {spbs.length === 0 ? (
        <Card padded>
          <Txt>{t('transport.none')}</Txt>
        </Card>
      ) : (
        <Card>
          {spbs.map((s, i) => (
            <ListRow
              key={s.mobileUuid}
              icon={s.parentSpbUuid ? 'truck-delivery' : 'truck'}
              tone={s.parentSpbUuid ? 'accent' : 'primary'}
              label={s.spbNo}
              description={`${plates.get(s.vehicleId) ?? '#' + s.vehicleId} · ${s.driverName} · ${t('transport.total', { bunches: s.totalBunch, kg: Math.round(s.estKg) })} · ${t(`status.${s.status}`)}`}
              last={i === spbs.length - 1}
              onPress={() => router.push({ pathname: '/transport/[id]', params: { id: s.mobileUuid } })}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 6 },
});
