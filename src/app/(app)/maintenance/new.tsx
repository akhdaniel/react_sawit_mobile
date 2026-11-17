/**
 * Tiket perawatan baru (struktur tiket perawatan ERP, satu pekerja per tiket):
 * kemandoran rawat → blok → sub blok → jenis perawatan → pekerja hadir → hasil kerja → material → Simpan.
 * Batas dosis material dan estimasi upah dari tarif ERP tampil live. "Simpan & pekerja berikutnya"
 * mempertahankan blok, jenis perawatan, dan material untuk pekerja berikutnya.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { NumberStepper } from '@/components/NumberStepper';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { attendanceByEmployee, isPresent } from '@/db/repositories/attendance';
import { rawatGangs } from '@/db/repositories/fertilization';
import { subBloksOf } from '@/db/repositories/harvest';
import { maintenanceEstimate, maintenanceMaterials, type MaintenanceTicketRow } from '@/db/repositories/maintenance';
import { block, employee, maintenanceTicket, type MaintenanceMaterial } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { formatRupiah } from '@/features/harvest/calc';
import { saveMaintenanceTicket } from '@/features/maintenance/actions';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { MAINTENANCE_WORK_TYPES, WEATHERS, type MaintenanceWorkType } from '@/sync/contract';
import { colors, radius, spacing } from '@/theme';

type Weather = NonNullable<MaintenanceTicketRow['weather']>;

export default function NewMaintenanceTicketScreen() {
  const services = useServices();
  const { db, clock } = services;
  const workDate = clock.workDate();
  const { correctionOf } = useLocalSearchParams<{ correctionOf?: string }>();
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);

  const original = useMemo(
    () =>
      correctionOf ? (db.select().from(maintenanceTicket).where(eq(maintenanceTicket.mobileUuid, correctionOf)).get() ?? null) : null,
    [correctionOf, db],
  );

  const gangs = useTableQuery(['gang'], () => rawatGangs(db, afdelingIds));
  const blocks = useTableQuery(['block'], () =>
    afdelingIds.length ? db.select().from(block).where(inArray(block.afdelingId, afdelingIds)).orderBy(asc(block.code)).all() : [],
  );
  const products = useTableQuery(['product'], () => maintenanceMaterials(db));

  const [gangId, setGangId] = useState<number | null>(original?.gangId ?? null);
  const [blockId, setBlockId] = useState<number | null>(original?.blockId ?? null);
  const [subBlokId, setSubBlokId] = useState<number | null>(original?.subBlokId ?? null);
  const [workType, setWorkType] = useState<MaintenanceWorkType>((original?.workType as MaintenanceWorkType) ?? 'semprot_gulma');
  const [workerId, setWorkerId] = useState<number | null>(original?.workerEmployeeId ?? null);
  const [areaHa, setAreaHa] = useState(original?.areaHa ?? 0);
  const [trees, setTrees] = useState(original?.treeCount ?? 0);
  const [hk, setHk] = useState(original?.hk ?? 1);
  const [materials, setMaterials] = useState<MaintenanceMaterial[]>(original?.materials ?? []);
  const [picking, setPicking] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(original?.weather ?? null);
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const effGangId = gangId ?? gangs[0]?.id ?? null;
  const effBlockId = blockId ?? blocks[0]?.id ?? null;
  const theBlock = blocks.find((b) => b.id === effBlockId) ?? null;
  const subBloks = useTableQuery(['sub_blok', String(effBlockId)], () => (effBlockId ? subBloksOf(db, effBlockId) : []));
  const effSubBlokId = subBloks.some((x) => x.id === subBlokId) ? subBlokId : subBloks.length === 1 ? subBloks[0]!.id : null;

  const day = useTableQuery(['attendance'], () => attendanceByEmployee(db, workDate));
  const workers = useMemo(() => {
    const ids = [...day.entries()]
      .filter(([, d]) => isPresent(d) && !d.checkOut && d.checkIn!.gangId === effGangId)
      .map(([id]) => id);
    if (original && !ids.includes(original.workerEmployeeId)) ids.push(original.workerEmployeeId);
    return ids.length ? db.select().from(employee).where(and(inArray(employee.id, ids))).orderBy(asc(employee.name)).all() : [];
  }, [day, effGangId, db, original]);

  // Versi master: berubah saat tarif/sub blok/karyawan/blok/produk tersinkron, memicu hitung ulang.
  const masterRev = useTableQuery(['harvest_rate', 'sub_blok', 'employee', 'block', 'product'], () => ({}));
  const estimate = useMemo(
    () =>
      maintenanceEstimate(db, {
        workDate,
        blockId: effBlockId,
        subBlokId: effSubBlokId,
        workerEmployeeId: workerId,
        workType,
        areaHa,
        treeCount: trees,
        hk,
        materials,
      }),
    // masterRev sengaja jadi dependency: hitung ulang saat master tersinkron.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, workDate, effBlockId, effSubBlokId, workerId, workType, areaHa, trees, hk, materials, masterRev],
  );
  const over = estimate.materials.some((m) => m.status === 'over');

  const setQty = (productId: number, qty: number) =>
    setMaterials((ms) => ms.map((m) => (m.product_id === productId ? { ...m, qty: Math.max(0, qty) } : m)));

  const save = async (next: boolean) => {
    if (!effGangId || !effBlockId || !workerId) return;
    setBusy(true);
    try {
      const ctx = await services.txContext();
      const r = saveMaintenanceTicket(db, ctx, {
        workDate,
        blockId: effBlockId,
        subBlokId: effSubBlokId,
        gangId: effGangId,
        workerEmployeeId: workerId,
        workType,
        areaHa,
        treeCount: trees,
        hk,
        weather,
        notes: notes.trim() || null,
        materials,
        correctionOf: original?.mobileUuid ?? null,
      });
      if (!r.ok) {
        Alert.alert(t('maintenance.title'), r.issues.map((i) => `• ${t(`maintenance.error.${i}`)}`).join('\n'));
        return;
      }
      if (next) {
        const name = workers.find((w) => w.id === workerId)?.name ?? '';
        setWorkerId(null);
        setNotes('');
        Alert.alert(t('maintenance.title'), t('maintenance.savedNext', { worker: name }));
        return;
      }
      router.replace({ pathname: '/maintenance/[id]', params: { id: r.mobileUuid, fresh: '1' } });
    } finally {
      setBusy(false);
    }
  };

  const title = original ? t('maintenance.correction') : t('maintenance.new');
  const missing = gangs.length === 0 ? 'noGang' : blocks.length === 0 ? 'noBlock' : null;
  if (missing) {
    return (
      <Screen title={title} back>
        <Card padded>
          <Txt>{t(`fertilization.${missing}`)}</Txt>
        </Card>
      </Screen>
    );
  }

  const canSave = !!effGangId && !!effBlockId && !!effSubBlokId && !!workerId && estimate.workQty > 0 && !over;
  const unpicked = products.filter((p) => !materials.some((m) => m.product_id === p.id));
  const steppers = {
    ha: <NumberStepper key="ha" label={t('maintenance.areaHa')} value={areaHa} onChange={(n) => setAreaHa(Math.max(0, n))} step={0.5} decimal large={estimate.unit === 'ha'} />,
    tree: <NumberStepper key="tree" label={t('maintenance.trees')} value={trees} onChange={(n) => setTrees(Math.max(0, Math.round(n)))} step={10} large={estimate.unit === 'tree'} />,
    hk: <NumberStepper key="hk" label={t('maintenance.hk')} value={hk} onChange={(n) => setHk(Math.max(0, n))} step={0.5} decimal large={estimate.unit === 'hk'} />,
  };
  // Satuan dasar upah jenis perawatan ditampilkan paling atas.
  const order = [estimate.unit, ...(['ha', 'tree', 'hk'] as const).filter((u) => u !== estimate.unit)];

  return (
    <Screen title={title} back>
      <SectionTitle>{t('fertilization.gang')}</SectionTitle>
      <View style={styles.grid}>
        {gangs.map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            selected={g.id === effGangId}
            onPress={() => {
              setGangId(g.id);
              setWorkerId(null);
            }}
          />
        ))}
      </View>

      <SectionTitle>
        {`${t('fertilization.block')}${theBlock ? ` · ${t('maintenance.blockArea', { ha: theBlock.ha, trees: theBlock.treeCount ?? '—' })}` : ''}`}
      </SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {blocks.map((b) => (
          <Chip
            key={b.id}
            label={b.code}
            selected={b.id === effBlockId}
            onPress={() => {
              setBlockId(b.id);
              setSubBlokId(null);
            }}
          />
        ))}
      </ScrollView>

      {subBloks.length > 1 && (
        <>
          <SectionTitle>{t('fertilization.subBlok')}</SectionTitle>
          <View style={styles.grid}>
            {subBloks.map((x) => (
              <Chip key={x.id} label={x.code} selected={x.id === effSubBlokId} onPress={() => setSubBlokId(x.id)} />
            ))}
          </View>
        </>
      )}

      <SectionTitle>{t('maintenance.workType')}</SectionTitle>
      <View style={styles.grid}>
        {MAINTENANCE_WORK_TYPES.map((w) => (
          <Chip key={w} label={t(`maintenance.workTypes.${w}`)} selected={w === workType} onPress={() => setWorkType(w)} />
        ))}
      </View>
      <Txt variant="small" style={{ color: colors.textMuted }}>
        {t(`maintenance.unitHint.${estimate.unit}`)}
      </Txt>

      <SectionTitle>{t('fertilization.worker')}</SectionTitle>
      {workers.length === 0 ? (
        <Card padded>
          <Txt>{t('fertilization.noWorker')}</Txt>
        </Card>
      ) : (
        <View style={styles.grid}>
          {workers.map((w) => (
            <Chip key={w.id} label={w.name} selected={w.id === workerId} onPress={() => setWorkerId(w.id)} />
          ))}
        </View>
      )}

      <Card padded>
        {order.map((u) => steppers[u])}
        {(estimate.areaLimit != null || estimate.treeLimit != null) && (
          <Txt variant="small" style={{ color: colors.textMuted }}>
            {t('maintenance.limit', {
              limit: [estimate.areaLimit != null ? `${estimate.areaLimit} ha` : null, estimate.treeLimit != null ? `${estimate.treeLimit} pokok` : null]
                .filter(Boolean)
                .join(' · '),
            })}
          </Txt>
        )}
      </Card>

      <SectionTitle>{t('maintenance.materials')}</SectionTitle>
      {estimate.materials.length === 0 && (
        <Card padded>
          <Txt>{t('maintenance.noMaterials')}</Txt>
        </Card>
      )}
      {estimate.materials.map((m) => (
        <Card key={m.productId} padded style={m.status === 'over' ? { borderWidth: 2, borderColor: colors.danger } : undefined}>
          <NumberStepper label={`${m.name} (${m.uom})`} value={m.qty} onChange={(n) => setQty(m.productId, n)} step={0.5} decimal />
          <View style={styles.row}>
            <Txt variant="small" style={{ flex: 1, color: m.status === 'over' ? colors.danger : colors.textMuted }}>
              {m.status === 'over'
                ? t('maintenance.overDose')
                : m.dosagePerHa == null
                  ? t('maintenance.materialNoLimit')
                  : areaHa > 0
                    ? t('maintenance.materialLimit', { max: m.max ?? 0, uom: m.uom, dosage: m.dosagePerHa })
                    : t('maintenance.materialNeedsArea')}
            </Txt>
            <Pressable accessibilityRole="button" onPress={() => setMaterials((ms) => ms.filter((x) => x.product_id !== m.productId))}>
              <Txt style={{ color: colors.danger, fontWeight: '700' }}>{t('maintenance.remove')}</Txt>
            </Pressable>
          </View>
        </Card>
      ))}
      {unpicked.length > 0 &&
        (picking ? (
          <View style={styles.grid}>
            {unpicked.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                onPress={() => {
                  setMaterials((ms) => [...ms, { product_id: p.id, qty: 0 }]);
                  setPicking(false);
                }}
              />
            ))}
          </View>
        ) : (
          <Button kind="outline" icon="flask-plus" label={t('maintenance.addMaterial')} onPress={() => setPicking(true)} />
        ))}

      <Card padded>
        <SectionTitle>{t('maintenance.weather')}</SectionTitle>
        <View style={styles.grid}>
          {WEATHERS.map((w) => (
            <Chip key={w} label={t(`fertilization.weathers.${w}`)} selected={w === weather} onPress={() => setWeather(w === weather ? null : w)} />
          ))}
        </View>
        <TextField label={t('maintenance.notes')} value={notes} onChangeText={setNotes} />
      </Card>

      <Card padded>
        <Txt variant="small" style={{ color: colors.textMuted }}>{t('maintenance.wage')}</Txt>
        <Txt style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{formatRupiah(estimate.wage)}</Txt>
        {estimate.rateAmount != null ? (
          <Txt variant="small" style={{ color: colors.textMuted }}>
            {t('maintenance.wageBasis', {
              qty: estimate.workQty,
              unit: t(`maintenance.unit.${estimate.unit}`),
              rate: formatRupiah(estimate.rateAmount),
            })}
          </Txt>
        ) : workerId ? (
          <Txt variant="small" style={{ color: colors.warning }}>
            {t('maintenance.noRate')}
          </Txt>
        ) : null}
      </Card>

      {!original && (
        <Button kind="outline" icon="account-arrow-right" label={t('maintenance.saveNext')} busy={busy} disabled={!canSave} onPress={() => void save(true)} />
      )}
      <Button icon="content-save" label={t('maintenance.save')} busy={busy} disabled={!canSave} onPress={() => void save(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs, borderRadius: radius.sm },
});
