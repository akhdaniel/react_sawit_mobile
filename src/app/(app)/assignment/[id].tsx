/** Penugasan tersimpan: form entry yang sama, terisi dan tidak bisa diubah. */
import { eq, inArray } from 'drizzle-orm';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { activity, assignment, block, employee, workPlan } from '@/db/schema';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { spacing } from '@/theme';

export default function AssignmentEntryScreen() {
  const { db } = useServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const row = useTableQuery(['assignment'], () => db.select().from(assignment).where(eq(assignment.mobileUuid, id)).get() ?? null);
  const refs = useTableQuery(['activity', 'block', 'work_plan', 'employee', 'assignment'], () => {
    if (!row) return null;
    return {
      act: db.select().from(activity).where(eq(activity.id, row.activityId)).get() ?? null,
      blk: db.select().from(block).where(eq(block.id, row.blockId)).get() ?? null,
      plan: row.workPlanId ? (db.select().from(workPlan).where(eq(workPlan.id, row.workPlanId)).get() ?? null) : null,
      workers: row.employeeIds.length ? db.select().from(employee).where(inArray(employee.id, row.employeeIds)).all() : [],
    };
  });

  if (!row || !refs) {
    return (
      <Screen title={t('assignment.title')} back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }
  const planLabel = `${refs.act?.name ?? `#${row.activityId}`} · ${t('assignment.block')} ${refs.blk?.code ?? row.blockId}`;

  return (
    <Screen title={t('assignment.title')} subtitle={row.workDate} back>
      <SavedEntryNotice status={row.status} savedAt={row.createdTrustedAt} />

      <SectionTitle>{t('assignment.plan')}</SectionTitle>
      <Card>
        {row.workPlanId ? (
          <ListRow
            icon="radiobox-marked"
            label={planLabel}
            description={[
              refs.plan?.targetHa != null ? t('assignment.target', { ha: refs.plan.targetHa }) : null,
              refs.plan?.targetBunch != null ? t('assignment.targetBunch', { bunch: refs.plan.targetBunch }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            last
          />
        ) : (
          <ListRow icon="radiobox-marked" tone="accent" label={t('assignment.unplanned')} last />
        )}
      </Card>

      {!row.workPlanId && (
        <Card padded>
          <Txt style={{ fontWeight: '700' }}>{t('assignment.activity')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Chip label={refs.act?.name ?? `#${row.activityId}`} selected />
          </View>
          <Txt style={{ fontWeight: '700' }}>{t('assignment.block')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Chip label={refs.blk?.code ?? String(row.blockId)} selected />
          </View>
          <TextField label={t('assignment.reason')} value={row.unplannedReason ?? ''} editable={false} />
        </Card>
      )}

      <SectionTitle>{`${t('assignment.workers')} (${refs.workers.length})`}</SectionTitle>
      <Card>
        {refs.workers.map((w, i) => (
          <ListRow
            key={w.id}
            icon="checkbox-marked"
            tone="success"
            label={w.name}
            description={`${w.nik} · ${w.type}`}
            last={i === refs.workers.length - 1}
          />
        ))}
      </Card>
    </Screen>
  );
}
