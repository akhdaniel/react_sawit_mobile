/** Tiket perawatan tersimpan (append-only): rincian, material & dosis, estimasi upah, dokumen ERP, Lanjutkan, koreksi. */
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { canCorrectMaintenance, maintenanceEstimate, maintenanceView } from '@/db/repositories/maintenance';
import { DocumentStatus } from '@/features/entry/DocumentStatus';
import { SavedEntryNotice } from '@/features/entry/SavedEntryNotice';
import { ContinueButton, ContinuePill, useDocumentVerified } from '@/features/entry/StageContinue';
import { formatRupiah } from '@/features/harvest/calc';
import type { MaintenanceWorkType } from '@/sync/contract';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors } from '@/theme';

export default function MaintenanceTicketScreen() {
  const refresh = useRefresh();
  const { db } = useServices();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const tk = useTableQuery(['maintenance_ticket'], () => maintenanceView(db, id));
  const corrected = useTableQuery(['maintenance_ticket'], () => !canCorrectMaintenance(db, id));
  const original = useTableQuery(['maintenance_ticket'], () => (tk?.correctionOf ? maintenanceView(db, tk.correctionOf) : null));
  const estimate = useTableQuery(['maintenance_ticket', 'harvest_rate', 'product', 'block', 'sub_blok', 'employee'], () =>
    tk ? maintenanceEstimate(db, { ...tk, workType: tk.workType as MaintenanceWorkType }) : null,
  );
  // Material sudah keluar dari gudang: koreksi dari HP ditolak server (ticket_already_verified).
  const verified = useDocumentVerified(id);

  if (!tk || !estimate) {
    return (
      <Screen refresh={refresh} title={t('maintenance.detail')} back>
        <Txt>{t('entry.unknown')}</Txt>
      </Screen>
    );
  }

  return (
    <Screen refresh={refresh} title={tk.workerName} subtitle={fresh ? t('maintenance.saved') : tk.workDate} back>
      <SavedEntryNotice status={tk.status} savedAt={tk.createdTrustedAt}>
        {corrected && <StatusPill label={t('maintenance.correctedBy')} tone="danger" />}
        <ContinuePill ticketUuid={tk.mobileUuid} />
      </SavedEntryNotice>
      {tk.status === 'rejected' && tk.rejectReason && (
        <Card padded style={{ borderWidth: 2, borderColor: colors.danger }}>
          <Txt variant="small" style={{ color: colors.textMuted }}>{t('maintenance.rejectReason')}</Txt>
          <Txt style={{ fontWeight: '700' }}>{tk.rejectReason}</Txt>
        </Card>
      )}
      <Card>
        <ListRow icon="map-marker" label={`${t('fertilization.block')} ${tk.blockCode}${tk.subBlokCode ? ` / ${tk.subBlokCode}` : ''}`} />
        <ListRow icon="sprout" tone="accent" label={t(`maintenance.workTypes.${tk.workType as MaintenanceWorkType}`)} description={t(`maintenance.unitHint.${estimate.unit}`)} />
        <ListRow icon="texture-box" label={t('maintenance.areaHa')} value={String(tk.areaHa)} />
        <ListRow icon="pine-tree" label={t('maintenance.trees')} value={String(tk.treeCount)} />
        <ListRow icon="calendar-clock" label={t('maintenance.hk')} value={String(tk.hk)} />
        {tk.weather && <ListRow icon="weather-partly-cloudy" label={t('maintenance.weather')} value={t(`fertilization.weathers.${tk.weather}`)} />}
        {tk.notes && <ListRow icon="note-text" label={tk.notes} />}
        <ListRow icon="cash" tone="success" label={t('maintenance.wage')} value={formatRupiah(estimate.wage)} last={!original} />
        {original && (
          <ListRow icon="history" tone="danger" label={t('maintenance.correctionOf', { worker: original.workerName, block: original.blockCode })} last />
        )}
      </Card>

      <SectionTitle>{t('maintenance.materials')}</SectionTitle>
      <Card>
        {estimate.materials.length === 0 ? (
          <ListRow icon="flask-empty-outline" label={t('maintenance.noMaterials')} last />
        ) : (
          estimate.materials.map((m, i) => (
            <ListRow
              key={m.productId}
              icon="flask"
              tone={m.status === 'over' ? 'danger' : 'primary'}
              label={m.name}
              value={`${m.qty} ${m.uom}`}
              description={m.max != null ? t('maintenance.materialLimit', { max: m.max, uom: m.uom, dosage: m.dosagePerHa ?? 0 }) : t('maintenance.materialNoLimit')}
              last={i === estimate.materials.length - 1}
            />
          ))
        )}
      </Card>

      <DocumentStatus mobileUuid={tk.mobileUuid} status={tk.status} />

      <ContinueButton type="maintenance_ticket" ticketUuid={tk.mobileUuid} />
      {!corrected && !verified && (
        <Button
          kind={tk.status === 'rejected' ? 'primary' : 'outline'}
          icon="pencil"
          label={t('maintenance.correction')}
          onPress={() => router.push({ pathname: '/maintenance/new', params: { correctionOf: tk.mobileUuid } })}
        />
      )}
    </Screen>
  );
}
