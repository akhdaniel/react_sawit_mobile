import { inArray } from 'drizzle-orm';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { assignmentsFor } from '@/db/repositories/assignment';
import { activity, block } from '@/db/schema';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';

export default function AssignmentListScreen() {
  const { db, clock } = useServices();
  const workDate = clock.workDate();
  const rows = useTableQuery(['assignment'], () => assignmentsFor(db, workDate));
  const names = useTableQuery(['activity', 'block', 'assignment'], () => {
    const acts = rows.length ? db.select().from(activity).where(inArray(activity.id, rows.map((r) => r.activityId))).all() : [];
    const blks = rows.length ? db.select().from(block).where(inArray(block.id, rows.map((r) => r.blockId))).all() : [];
    return { acts: new Map(acts.map((a) => [a.id, a.name])), blks: new Map(blks.map((b) => [b.id, b.code])) };
  });

  return (
    <Screen title={t('assignment.title')} back>
      <Button icon="clipboard-plus" label={t('assignment.new')} onPress={() => router.push('/assignment/new')} />
      <SectionTitle>{t('assignment.today')}</SectionTitle>
      {rows.length === 0 ? (
        <Card padded>
          <Txt>{t('assignment.none')}</Txt>
        </Card>
      ) : (
        <Card>
          {rows.map((r, i) => (
            <ListRow
              key={r.mobileUuid}
              icon={r.workPlanId ? 'clipboard-check' : 'clipboard-alert'}
              tone={r.workPlanId ? 'primary' : 'accent'}
              label={`${names.acts.get(r.activityId) ?? `#${r.activityId}`} · ${t('assignment.block')} ${names.blks.get(r.blockId) ?? r.blockId}`}
              description={`${t('assignment.workersCount', { count: r.employeeIds.length })} · ${t(`status.${r.status}`)}${r.unplannedReason ? ` · ${r.unplannedReason}` : ''}`}
              last={i === rows.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
