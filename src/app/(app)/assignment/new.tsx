/**
 * Penugasan baru: pilih rencana kerja hari ini (atau "di luar rencana" + kegiatan, blok,
 * alasan), pilih pekerja yang sudah absen hadir, simpan.
 */
import { and, asc, inArray } from 'drizzle-orm';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { workPlansFor } from '@/db/repositories/assignment';
import { attendanceByEmployee, isPresent } from '@/db/repositories/attendance';
import { activity, block, employee } from '@/db/schema';
import { createAssignment } from '@/features/attendance/assignment-actions';
import { useGangSelection } from '@/features/attendance/useGang';
import { useSession } from '@/features/auth/session-store';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { spacing } from '@/theme';

const UNPLANNED = -1;

export default function NewAssignmentScreen() {
  const services = useServices();
  const { db, clock } = services;
  const workDate = clock.workDate();
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);
  const { gangs, selected, select } = useGangSelection();

  const plans = useTableQuery(['work_plan', String(selected?.id)], () => (selected ? workPlansFor(db, workDate, selected.id) : []));
  const activities = useTableQuery(['activity'], () => db.select().from(activity).orderBy(asc(activity.code)).all());
  const blocks = useTableQuery(['block'], () =>
    afdelingIds.length ? db.select().from(block).where(inArray(block.afdelingId, afdelingIds)).orderBy(asc(block.code)).all() : [],
  );
  const day = useTableQuery(['attendance'], () => attendanceByEmployee(db, workDate));
  const presentWorkers = useMemo(() => {
    if (!selected) return [];
    const ids = [...day.entries()].filter(([, d]) => isPresent(d) && d.checkIn!.gangId === selected.id && !d.checkOut).map(([id]) => id);
    return ids.length ? db.select().from(employee).where(and(inArray(employee.id, ids))).orderBy(asc(employee.name)).all() : [];
  }, [day, selected, db]);

  const [planId, setPlanId] = useState<number | null>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [blockId, setBlockId] = useState<number | null>(null);
  const [blockQuery, setBlockQuery] = useState('');
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [busy, setBusy] = useState(false);

  const effectivePlan = planId ?? plans[0]?.id ?? UNPLANNED;
  const plan = plans.find((p) => p.id === effectivePlan);
  const chosen = picked ?? new Set(presentWorkers.map((w) => w.id));
  const actName = new Map(activities.map((a) => [a.id, a.name]));
  const blkCode = new Map(blocks.map((b) => [b.id, b.code]));
  const bq = blockQuery.trim().toUpperCase();

  const toggle = (id: number) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const save = async () => {
    const input = {
      workDate,
      workPlanId: plan?.id ?? null,
      unplannedReason: plan ? null : reason,
      activityId: plan?.activityId ?? activityId ?? 0,
      blockId: plan?.blockId ?? blockId ?? 0,
      employeeIds: [...chosen],
    };
    setBusy(true);
    try {
      const r = createAssignment(db, await services.txContext(), input);
      if (r.ok) {
        Alert.alert(t('assignment.saved'));
        router.back();
      } else {
        Alert.alert(t('assignment.title'), r.issues.map((i) => `• ${t(`assignment.error.${i.code}`)}`).join('\n'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('assignment.new')} back>
      <SectionTitle>{t('attendance.gang')}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {gangs.map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            selected={g.id === selected?.id}
            onPress={() => {
              select(g.id);
              setPlanId(null);
              setPicked(null);
            }}
          />
        ))}
      </ScrollView>

      <SectionTitle>{t('assignment.plan')}</SectionTitle>
      <Card>
        {plans.map((p) => (
          <ListRow
            key={p.id}
            icon={effectivePlan === p.id ? 'radiobox-marked' : 'radiobox-blank'}
            label={`${actName.get(p.activityId) ?? `#${p.activityId}`} · ${t('assignment.block')} ${blkCode.get(p.blockId) ?? p.blockId}`}
            description={[
              p.targetHa != null ? t('assignment.target', { ha: p.targetHa }) : null,
              p.targetBunch != null ? t('assignment.targetBunch', { bunch: p.targetBunch }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => setPlanId(p.id)}
          />
        ))}
        {plans.length === 0 && <ListRow icon="information-outline" label={t('assignment.noPlan')} />}
        <ListRow
          icon={effectivePlan === UNPLANNED ? 'radiobox-marked' : 'radiobox-blank'}
          tone="accent"
          label={t('assignment.unplanned')}
          last
          onPress={() => setPlanId(UNPLANNED)}
        />
      </Card>

      {effectivePlan === UNPLANNED && (
        <Card padded>
          <Txt style={{ fontWeight: '700' }}>{t('assignment.activity')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {activities.map((a) => (
              <Chip key={a.id} label={a.name} selected={activityId === a.id} onPress={() => setActivityId(a.id)} />
            ))}
          </View>
          <TextField label={t('assignment.searchBlock')} value={blockQuery} onChangeText={setBlockQuery} autoCapitalize="characters" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {blocks
              .filter((b) => !bq || b.code.includes(bq))
              .slice(0, 30)
              .map((b) => (
                <Chip key={b.id} label={b.code} selected={blockId === b.id} onPress={() => setBlockId(b.id)} />
              ))}
          </View>
          <TextField label={t('assignment.reason')} value={reason} onChangeText={setReason} />
        </Card>
      )}

      <SectionTitle>{`${t('assignment.workers')} (${chosen.size}/${presentWorkers.length})`}</SectionTitle>
      {presentWorkers.length === 0 ? (
        <Card padded>
          <Txt>{t('assignment.noPresent')}</Txt>
        </Card>
      ) : (
        <Card>
          <ListRow icon="checkbox-multiple-marked" tone="accent" label={t('assignment.selectAll')} onPress={() => setPicked(new Set(presentWorkers.map((w) => w.id)))} />
          {presentWorkers.map((w, i) => (
            <ListRow
              key={w.id}
              icon={chosen.has(w.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
              tone={chosen.has(w.id) ? 'success' : 'primary'}
              label={w.name}
              description={`${w.nik} · ${w.type}`}
              last={i === presentWorkers.length - 1}
              onPress={() => toggle(w.id)}
            />
          ))}
        </Card>
      )}

      <Button icon="content-save" label={t('assignment.save', { count: chosen.size })} busy={busy} disabled={chosen.size === 0} onPress={() => void save()} />
    </Screen>
  );
}
