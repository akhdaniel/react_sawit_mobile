/**
 * Tiket panen baru (≤ 3 ketukan): pilih TPH → pilih pemanen → isi janjang matang → Simpan.
 * Blok default dari penugasan/rencana kerja gang hari ini. est_kg & estimasi premi tampil live.
 */
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { NumberStepper } from '@/components/NumberStepper';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { attendanceByEmployee, isPresent } from '@/db/repositories/attendance';
import { findDuplicateTicket } from '@/db/repositories/harvest';
import { activity, assignment, block, employee, harvestTicket, penaltyRule, tph, workPlan } from '@/db/schema';
import { useGangSelection } from '@/features/attendance/useGang';
import { useSession } from '@/features/auth/session-store';
import { CameraCapture, type CapturedPhoto } from '@/features/camera/CameraCapture';
import { saveHarvestTicket } from '@/features/harvest/actions';
import { EMPTY_COUNTS, estKg, formatRupiah, premiEstimate, type BunchCounts } from '@/features/harvest/calc';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

export default function NewHarvestTicketScreen() {
  const services = useServices();
  const { db, clock } = services;
  const workDate = clock.workDate();
  const { correctionOf } = useLocalSearchParams<{ correctionOf?: string }>();
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);
  const { gangs, selected, select } = useGangSelection();

  const original = useMemo(
    () => (correctionOf ? (db.select().from(harvestTicket).where(eq(harvestTicket.mobileUuid, correctionOf)).get() ?? null) : null),
    [correctionOf, db],
  );

  const blocks = useTableQuery(['block'], () =>
    afdelingIds.length ? db.select().from(block).where(and(inArray(block.afdelingId, afdelingIds), eq(block.status, 'TM'))).orderBy(asc(block.code)).all() : [],
  );
  // Blok default: penugasan panen terakhir gang hari ini → rencana kerja → blok pertama.
  const suggestedBlockId = useTableQuery(['assignment', 'work_plan', String(selected?.id)], () => {
    const harvestActs = db.select({ id: activity.id }).from(activity).where(eq(activity.kind, 'harvest')).all().map((a) => a.id);
    if (harvestActs.length) {
      const a = db
        .select({ blockId: assignment.blockId })
        .from(assignment)
        .where(and(eq(assignment.workDate, workDate), ne(assignment.status, 'rejected'), inArray(assignment.activityId, harvestActs)))
        .orderBy(desc(assignment.createdTrustedAt))
        .get();
      if (a) return a.blockId;
    }
    if (selected) {
      const p = db.select({ blockId: workPlan.blockId }).from(workPlan).where(and(eq(workPlan.date, workDate), eq(workPlan.gangId, selected.id))).get();
      if (p) return p.blockId;
    }
    return null;
  });

  const [blockId, setBlockId] = useState<number | null>(original?.blockId ?? null);
  const effBlockId = blockId ?? suggestedBlockId ?? blocks[0]?.id ?? null;
  const theBlock = blocks.find((b) => b.id === effBlockId) ?? null;
  const tphs = useTableQuery(['tph', String(effBlockId)], () =>
    effBlockId ? db.select().from(tph).where(eq(tph.blockId, effBlockId)).orderBy(asc(tph.code)).all() : [],
  );

  const day = useTableQuery(['attendance'], () => attendanceByEmployee(db, workDate));
  const harvesters = useMemo(() => {
    const ids = [...day.entries()]
      .filter(([, d]) => isPresent(d) && !d.checkOut && (!selected || d.checkIn!.gangId === selected.id))
      .map(([id]) => id);
    if (original && !ids.includes(original.harvesterEmployeeId)) ids.push(original.harvesterEmployeeId);
    return ids.length ? db.select().from(employee).where(inArray(employee.id, ids)).orderBy(asc(employee.name)).all() : [];
  }, [day, selected, db, original]);

  const [tphId, setTphId] = useState<number | null>(original?.tphId ?? null);
  const [harvesterId, setHarvesterId] = useState<number | null>(original?.harvesterEmployeeId ?? null);
  const [counts, setCounts] = useState<BunchCounts>(
    original
      ? { ripe: original.ripe, unripe: original.unripe, rotten: original.rotten, emptyBunch: original.emptyBunch, longStalk: original.longStalk, looseFruitKg: original.looseFruitKg }
      : EMPTY_COUNTS,
  );
  const [more, setMore] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);

  const harvestActivity = useTableQuery(['activity'], () => db.select().from(activity).where(eq(activity.kind, 'harvest')).orderBy(asc(activity.id)).get() ?? null);
  const penalties = useTableQuery(['penalty_rule'], () => new Map(db.select().from(penaltyRule).all().map((p) => [p.code, p.amount])));
  const kg = estKg(counts, theBlock?.bjrKg ?? 0);
  const premi = premiEstimate(counts, harvestActivity, penalties);
  const duplicate =
    !original && tphId && harvesterId ? findDuplicateTicket(db, workDate, tphId, harvesterId) : null;

  const set = (k: keyof BunchCounts) => (n: number) => setCounts((c) => ({ ...c, [k]: n }));

  const save = async () => {
    if (!effBlockId || !tphId || !harvesterId) return;
    setBusy(true);
    try {
      const ctx = await services.txContext();
      const r = saveHarvestTicket(
        db,
        ctx,
        { workDate, blockId: effBlockId, tphId, harvesterEmployeeId: harvesterId, ...counts, correctionOf: original?.mobileUuid ?? null },
        services.device.deviceShort,
        photo ?? undefined,
      );
      if (!r.ok) {
        Alert.alert(t('harvest.title'), r.issues.map((i) => `• ${t(`harvest.error.${i}`)}`).join('\n'));
        return;
      }
      router.replace({ pathname: '/harvest/[id]', params: { id: r.ticket.mobileUuid, fresh: '1' } });
    } finally {
      setBusy(false);
    }
  };

  if (blocks.length === 0) {
    return (
      <Screen title={t('harvest.new')} back>
        <Card padded>
          <Txt>{t('harvest.noBlock')}</Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={original ? t('harvest.correction') : t('harvest.new')} subtitle={original ? t('harvest.correctionOf', { no: original.ticketNo }) : undefined} back>
      {!original && gangs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {gangs.map((g) => (
            <Chip key={g.id} label={g.name} selected={g.id === selected?.id} onPress={() => select(g.id)} />
          ))}
        </ScrollView>
      )}

      <SectionTitle>{`${t('harvest.block')} · ${theBlock ? t('harvest.bjr', { bjr: theBlock.bjrKg }) : ''}`}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {blocks.map((b) => (
          <Chip
            key={b.id}
            label={b.code}
            selected={b.id === effBlockId}
            onPress={() => {
              setBlockId(b.id);
              setTphId(null);
            }}
          />
        ))}
      </ScrollView>

      <SectionTitle>{t('harvest.tph')}</SectionTitle>
      <View style={styles.grid}>
        {tphs.map((x) => (
          <Chip key={x.id} label={x.code} selected={x.id === tphId} onPress={() => setTphId(x.id)} />
        ))}
      </View>

      <SectionTitle>{t('harvest.harvester')}</SectionTitle>
      {harvesters.length === 0 ? (
        <Card padded>
          <Txt>{t('harvest.noHarvester')}</Txt>
        </Card>
      ) : (
        <View style={styles.grid}>
          {harvesters.map((h) => (
            <Chip key={h.id} label={h.name} selected={h.id === harvesterId} onPress={() => setHarvesterId(h.id)} />
          ))}
        </View>
      )}

      {duplicate && (
        <View style={styles.notice} accessibilityRole="alert">
          <Icon name="alert" size={24} color={colors.text} />
          <Txt style={{ flex: 1, fontWeight: '700' }}>{t('harvest.lateEntryNotice')}</Txt>
        </View>
      )}

      <Card padded>
        <NumberStepper label={t('harvest.ripe')} value={counts.ripe} onChange={set('ripe')} large />
        <Pressable accessibilityRole="button" onPress={() => setMore((m) => !m)} style={styles.toggle}>
          <Icon name="tune-variant" size={22} color={colors.primary} />
          <Txt style={{ flex: 1, color: colors.primary, fontWeight: '700' }}>{t('harvest.moreDetail')}</Txt>
          <Icon name={more ? 'chevron-up' : 'chevron-down'} size={26} color={colors.primary} />
        </Pressable>
        {more && (
          <>
            <NumberStepper label={t('harvest.unripe')} value={counts.unripe} onChange={set('unripe')} />
            <NumberStepper label={t('harvest.rotten')} value={counts.rotten} onChange={set('rotten')} />
            <NumberStepper label={t('harvest.emptyBunch')} value={counts.emptyBunch} onChange={set('emptyBunch')} />
            <NumberStepper label={t('harvest.longStalk')} value={counts.longStalk} onChange={set('longStalk')} />
            <NumberStepper label={t('harvest.looseFruit')} value={counts.looseFruitKg} onChange={set('looseFruitKg')} step={0.5} decimal />
          </>
        )}
      </Card>

      <Card padded>
        <View style={styles.summary}>
          <View style={{ flex: 1 }}>
            <Txt variant="small" style={{ color: colors.textMuted }}>{t('harvest.estKg')}</Txt>
            <Txt style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>{kg} kg</Txt>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Txt variant="small" style={{ color: colors.textMuted }}>{t('harvest.premi')}</Txt>
            <Txt style={{ fontSize: 22, fontWeight: '800', color: colors.success }}>{formatRupiah(premi.net)}</Txt>
            {premi.penalty > 0 && (
              <Txt variant="small" style={{ color: colors.danger }}>
                {t('harvest.penalty')} −{formatRupiah(premi.penalty)}
              </Txt>
            )}
          </View>
        </View>
      </Card>

      <Button kind="outline" icon={photo ? 'check-circle' : 'camera'} label={photo ? t('harvest.photoTaken') : t('harvest.photo')} onPress={() => setCamera(true)} />
      <Button icon="content-save" label={t('harvest.save')} busy={busy} disabled={!tphId || !harvesterId} onPress={() => void save()} />

      <CameraCapture
        visible={camera}
        title={t('harvest.photo')}
        onCaptured={(p) => {
          setPhoto(p);
          setCamera(false);
        }}
        onCancel={() => setCamera(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft, borderLeftWidth: 6, borderLeftColor: colors.warning },
  toggle: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
