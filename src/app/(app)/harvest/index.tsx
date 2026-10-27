import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { ticketViews } from '@/db/repositories/harvest';
import { totalBunches, totalsByTph } from '@/features/harvest/calc';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export default function HarvestListScreen() {
  const { db, clock } = useServices();
  const workDate = clock.workDate();
  const tickets = useTableQuery(['harvest_ticket', 'spb', 'spb_line'], () => ticketViews(db, workDate));
  const bunches = tickets.reduce((s, x) => s + totalBunches(x), 0);
  const kg = Math.round(tickets.reduce((s, x) => s + x.estKg, 0));
  const [view, setView] = useState<'tickets' | 'tph'>('tickets');
  const perTph = useMemo(() => totalsByTph(tickets), [tickets]);

  return (
    <Screen title={t('harvest.title')} subtitle={t('harvest.totals', { tickets: tickets.length, bunches, kg })} back>
      <Button icon="ticket-confirmation" label={t('harvest.new')} onPress={() => router.push('/harvest/new')} />
      <SectionTitle>{t('harvest.today')}</SectionTitle>
      {tickets.length > 0 && (
        <View style={styles.toggle}>
          <Chip label={t('harvest.viewTickets')} selected={view === 'tickets'} onPress={() => setView('tickets')} />
          <Chip label={t('harvest.viewTph')} selected={view === 'tph'} onPress={() => setView('tph')} />
        </View>
      )}
      {tickets.length === 0 ? (
        <Card padded>
          <Txt>{t('harvest.none')}</Txt>
        </Card>
      ) : view === 'tph' ? (
        <Card>
          {perTph.map((x, i) => (
            <View key={x.tphId} style={[styles.row, i < perTph.length - 1 && styles.divider]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: '800' }}>
                  {x.blockCode} · {x.tphCode}
                </Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>
                  {t('harvest.tphSummary', { tickets: x.tickets, harvesters: x.harvesters })}
                  {x.looseFruitKg > 0 ? ` · ${t('harvest.tphLoose', { kg: x.looseFruitKg })}` : ''}
                </Txt>
                <View style={styles.pills}>
                  {x.bunchesNotTransported > 0 ? (
                    <StatusPill label={t('harvest.tphNotTransported', { bunches: x.bunchesNotTransported })} tone="warning" />
                  ) : (
                    <StatusPill label={t('harvest.tphAllTransported')} tone="success" />
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt style={{ fontSize: 24, fontWeight: '800', color: colors.primary }}>{x.bunches}</Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>{Math.round(x.estKg)} kg</Txt>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          {tickets.map((x, i) => (
            <Pressable
              key={x.mobileUuid}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/harvest/[id]', params: { id: x.mobileUuid } })}
              style={({ pressed }) => [styles.row, i < tickets.length - 1 && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: '800' }}>{x.ticketNo}</Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>
                  {x.blockCode} · {x.tphCode} · {x.harvesterName}
                </Txt>
                <View style={styles.pills}>
                  {x.isLateEntry && <StatusPill label={t('harvest.lateEntry')} tone="warning" />}
                  <StatusPill label={x.transported ? t('harvest.transported') : t('harvest.notTransported')} tone={x.transported ? 'success' : 'neutral'} />
                  <StatusPill label={t(`status.${x.status}`)} tone={x.status === 'queued' ? 'warning' : x.status === 'rejected' ? 'danger' : 'primary'} />
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt style={{ fontSize: 24, fontWeight: '800', color: colors.primary }}>{totalBunches(x)}</Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>{Math.round(x.estKg)} kg</Txt>
              </View>
              <Icon name="chevron-right" size={28} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 72 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border },
  toggle: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});
