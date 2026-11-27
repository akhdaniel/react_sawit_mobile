/**
 * Pilih pekerja hadir untuk tiket kerja lapangan (pemupukan/perawatan): anggota kemandoran yang dipilih, lalu
 * pekerja bantuan yang hadir di kemandoran lain — dari HP ini atau HP lain (kehadiran dari server saat sinkron).
 */
import { eq } from 'drizzle-orm';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { presentFieldWorkers, type PresentFieldWorker } from '@/db/repositories/attendance';
import { employee } from '@/db/schema';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

/** Pekerja yang bisa dipilih; `extraId` (pekerja tiket asal saat koreksi) tetap ada walau sudah pulang. */
export function usePresentFieldWorkers(workDate: string, gangId: number | null, extraId?: number | null): PresentFieldWorker[] {
  const { db } = useServices();
  return useTableQuery(['attendance', 'present_worker', 'employee', 'gang', `${gangId}/${extraId ?? ''}`], () => {
    const list = presentFieldWorkers(db, workDate, gangId);
    if (extraId && !list.some((w) => w.id === extraId)) {
      const e = db.select().from(employee).where(eq(employee.id, extraId)).get();
      if (e) list.unshift({ id: e.id, name: e.name, gangId: gangId ?? 0, gangName: '', helper: false });
    }
    return list;
  });
}

export function WorkerPicker({
  workers,
  selectedId,
  onSelect,
}: {
  workers: readonly PresentFieldWorker[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const members = workers.filter((w) => !w.helper);
  const helpers = workers.filter((w) => w.helper);
  const [showHelpers, setShowHelpers] = useState(false);
  const open = showHelpers || helpers.some((w) => w.id === selectedId);

  return (
    <>
      <SectionTitle>{t('fertilization.worker')}</SectionTitle>
      {members.length === 0 ? (
        <Card padded>
          <Txt>{t('fertilization.noWorker')}</Txt>
        </Card>
      ) : (
        <View style={styles.grid}>
          {members.map((w) => (
            <Chip key={w.id} label={w.name} selected={w.id === selectedId} onPress={() => onSelect(w.id)} />
          ))}
        </View>
      )}
      {helpers.length > 0 &&
        (open ? (
          <>
            <Txt variant="small" style={{ color: colors.textMuted }}>
              {t('entry.helperHint')}
            </Txt>
            <View style={styles.grid}>
              {helpers.map((w) => (
                <Chip key={w.id} label={`${w.name} · ${w.gangName}`} selected={w.id === selectedId} onPress={() => onSelect(w.id)} />
              ))}
            </View>
          </>
        ) : (
          <Button kind="outline" icon="account-switch" label={t('entry.helpers', { count: helpers.length })} onPress={() => setShowHelpers(true)} />
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
