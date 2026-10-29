import { inArray } from 'drizzle-orm';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { reportsFor, type DailySummary } from '@/db/repositories/daily-report';
import { gang } from '@/db/schema';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';

export default function DailyReportListScreen() {
  const { db, clock } = useServices();
  const date = clock.workDate();
  const rows = useTableQuery(['daily_report'], () => reportsFor(db, date));
  const gangs = useTableQuery(['gang', 'daily_report'], () =>
    rows.length ? new Map(db.select().from(gang).where(inArray(gang.id, rows.map((r) => r.gangId))).all().map((g) => [g.id, g.name])) : new Map<number, string>(),
  );

  return (
    <Screen title={t('report.title')} back>
      <Button icon="file-sign" label={t('report.new')} onPress={() => router.push('/daily-report/new')} />
      <SectionTitle>{t('report.list')}</SectionTitle>
      {rows.length === 0 ? (
        <Card padded>
          <Txt>{t('report.none')}</Txt>
        </Card>
      ) : (
        <Card>
          {rows.map((r, i) => {
            const s = r.summaryJson as unknown as DailySummary;
            return (
              <ListRow
                key={r.mobileUuid}
                icon={r.correctionOf ? 'file-replace' : 'file-document-edit'}
                tone={r.correctionOf ? 'accent' : 'primary'}
                label={gangs.get(r.gangId) ?? `#${r.gangId}`}
                description={`${t('report.tickets', { count: s.harvest?.tickets ?? 0, bunches: s.harvest?.bunches ?? 0, kg: Math.round(s.harvest?.estKg ?? 0) })} · ${t(`status.${r.status}`)}`}
                last={i === rows.length - 1}
                onPress={() => router.push({ pathname: '/daily-report/[id]', params: { id: r.mobileUuid } })}
              />
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
