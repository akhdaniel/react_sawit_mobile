/** Inspeksi tersimpan (append-only): rincian, isian checklist, taksasi/sensus, temuan, foto, dokumen ERP, koreksi. */
import { eq } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import {
  canCorrectInspection,
  inspectionFindings,
  inspectionScore,
  inspectionView,
  isSelfInspection,
  taksasiEstimate,
  templateItems,
} from '@/db/repositories/inspection';
import { block, employee, gang, tph } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { DocumentStatus } from '@/features/entry/DocumentStatus';
import { EntryPhotos } from '@/features/entry/EntryPhotos';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { lineValue } from '@/features/inspection/calc';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors } from '@/theme';

export default function InspectionScreen() {
  const refresh = useRefresh();
  const { db } = useServices();
  const employeeId = useSession((s) => s.user?.employee_id);
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const row = useTableQuery(['inspection', 'inspection_finding', 'inspection_template'], () => inspectionView(db, id));
  const corrected = useTableQuery(['inspection'], () => !canCorrectInspection(db, id));
  const original = useTableQuery(['inspection'], () => (row?.correctionOf ? inspectionView(db, row.correctionOf) : null));
  const items = useTableQuery(['inspection_item', String(row?.templateId)], () => (row ? templateItems(db, row.templateId) : []));
  const score = useTableQuery(['inspection_item', 'inspection_template', id], () => (row ? inspectionScore(db, row.templateId, row.lines) : null));
  const findings = useTableQuery(['inspection_finding', id], () => inspectionFindings(db, id));
  const names = useTableQuery(['block', 'tph', 'employee', 'gang', id], () =>
    row
      ? {
          tph: row.tphId ? db.select().from(tph).where(eq(tph.id, row.tphId)).get()?.code : null,
          harvester: row.harvesterEmployeeId ? db.select().from(employee).where(eq(employee.id, row.harvesterEmployeeId)).get()?.name : null,
          gang: row.gangId ? db.select().from(gang).where(eq(gang.id, row.gangId)).get()?.name : null,
          block: db.select().from(block).where(eq(block.id, row.blockId)).get() ?? null,
        }
      : null,
  );
  const self = useTableQuery(['gang', 'employee', id], () => (row ? isSelfInspection(db, row, employeeId) : false));
  const estimate = useTableQuery(['block', id], () => (row?.taksasi ? taksasiEstimate(db, row.blockId, row.taksasi) : null));

  if (!row || !score || !names) {
    return (
      <Screen refresh={refresh} title={t('inspection.detail')} back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }

  const byItem = new Map(row.lines.map((l) => [l.item_id, l]));
  const resultById = new Map(score.lines.map((l) => [l.itemId, l]));
  const hasScore = score.result != null;

  return (
    <Screen refresh={refresh} title={`${t(`inspection.types.${row.inspectionType}`)} · ${row.blockCode}`} subtitle={fresh ? t('inspection.saved') : row.workDate} back>
      <SavedEntryNotice status={row.status} savedAt={row.createdTrustedAt}>
        {corrected && <StatusPill label={t('inspection.correctedBy')} tone="danger" />}
        {self && <StatusPill label={t('inspection.selfInspection')} tone="warning" />}
      </SavedEntryNotice>
      {row.status === 'rejected' && row.rejectReason && (
        <Card padded style={{ borderWidth: 2, borderColor: colors.danger }}>
          <Txt variant="small" style={{ color: colors.textMuted }}>{t('inspection.rejectReason')}</Txt>
          <Txt style={{ fontWeight: '700' }}>{row.rejectReason}</Txt>
        </Card>
      )}

      <Card>
        <ListRow icon="clipboard-text-outline" label={row.templateName} description={t(`inspection.types.${row.inspectionType}`)} />
        <ListRow icon="map-marker" label={`${t('inspection.block')} ${row.blockCode}`} value={names.tph ?? undefined} />
        {names.harvester && <ListRow icon="account-hard-hat" label={names.harvester} />}
        {names.gang && <ListRow icon="account-group" label={names.gang} />}
        <ListRow icon="counter" label={t('inspection.sampleCount')} value={String(row.sampleSize)} />
        <ListRow
          icon="percent"
          tone={hasScore ? (score.result === 'pass' ? 'success' : 'danger') : 'primary'}
          label={t('inspection.score')}
          value={hasScore ? `${row.scorePct.toFixed(1)}% · ${t(score.result === 'pass' ? 'inspection.pass' : 'inspection.fail')}` : t('inspection.noScore')}
          last={!original}
        />
        {original && (
          <ListRow
            icon="history"
            tone="danger"
            label={t('inspection.correctionOf', { type: t(`inspection.types.${original.inspectionType}`), block: original.blockCode })}
            last
          />
        )}
      </Card>

      {row.taksasi && estimate && (
        <Card>
          <ListRow icon="pine-tree" label={t('inspection.taksasi.sampledTrees')} value={String(row.taksasi.sampled_trees)} />
          <ListRow icon="fruit-grapes" label={t('inspection.taksasi.ripe')} value={String(row.taksasi.ripe_bunches_counted)} />
          <ListRow icon="percent" label={t('inspection.taksasi.akp')} value={`${estimate.akpPct.toFixed(1)}%`} />
          <ListRow icon="calculator" label={t('inspection.taksasi.estBunches')} value={Math.round(estimate.estBunches).toLocaleString('id-ID')} />
          <ListRow icon="weight-kilogram" tone="success" label={t('inspection.taksasi.estKg')} value={`${Math.round(estimate.estKg).toLocaleString('id-ID')} kg`} last />
        </Card>
      )}

      {row.sensus && (
        <Card>
          <ListRow icon="pine-tree" label={t('inspection.sensus.productive')} value={String(row.sensus.tree_count_productive)} description={names.block?.treeCountProductive != null ? t('inspection.sensus.master', { count: names.block.treeCountProductive }) : undefined} />
          <ListRow icon="sprout" label={t('inspection.sensus.sisipan')} value={String(row.sensus.tree_count_sisipan)} description={names.block?.treeCountSisipan != null ? t('inspection.sensus.master', { count: names.block.treeCountSisipan }) : undefined} />
          <ListRow icon="tree-outline" label={t('inspection.sensus.dead')} value={String(row.sensus.tree_count_dead)} description={names.block?.treeCountDead != null ? t('inspection.sensus.master', { count: names.block.treeCountDead }) : undefined} />
          <ListRow icon="alert-octagon-outline" label={t('inspection.sensus.abnormal')} value={String(row.sensus.tree_count_abnormal)} last />
        </Card>
      )}

      {items.length > 0 && (
        <>
          <SectionTitle>{t('inspection.checklist')}</SectionTitle>
          <Card>
            {items.map((item, i) => {
              const value = lineValue(item, byItem.get(item.id));
              const r = resultById.get(item.id);
              const shown =
                typeof value === 'boolean' ? t(value ? 'inspection.yes' : 'inspection.no') : value == null ? t('inspection.notAnswered') : `${value}${item.uom ? ` ${item.uom}` : ''}`;
              return <ListRow key={item.id} icon={r?.bad ? 'alert' : 'check'} tone={r?.bad ? 'danger' : 'primary'} label={item.name} value={shown} last={i === items.length - 1} />;
            })}
          </Card>
        </>
      )}

      <SectionTitle>{t('inspection.findings', { count: findings.length })}</SectionTitle>
      {findings.length === 0 ? (
        <Card padded>
          <Txt>{t('inspection.noFindings')}</Txt>
        </Card>
      ) : (
        <Card>
          {findings.map((f, i) => (
            <ListRow
              key={f.findingUuid}
              icon="alert-circle"
              tone={f.severity === 'minor' ? 'primary' : 'danger'}
              label={`${t(`finding.severities.${f.severity}`)} · ${t(`finding.categories.${f.category as 'lainnya'}`)}`}
              description={[f.description, f.rowNo || f.treeNo ? t('finding.location', { row: f.rowNo ?? '—', tree: f.treeNo ?? '—' }) : null].filter(Boolean).join(' · ')}
              last={i === findings.length - 1}
            />
          ))}
        </Card>
      )}

      <EntryPhotos transactionUuid={row.mobileUuid} />
      <DocumentStatus mobileUuid={row.mobileUuid} status={row.status} />

      {!corrected && (
        <Button
          kind={row.status === 'rejected' ? 'primary' : 'outline'}
          icon="pencil"
          label={t('inspection.correction')}
          onPress={() => router.push({ pathname: '/inspection/new', params: { correctionOf: row.mobileUuid } })}
        />
      )}
    </Screen>
  );
}
