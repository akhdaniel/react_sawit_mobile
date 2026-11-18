/**
 * Tiket pemupukan baru (struktur tiket pemupukan ERP, satu pekerja per tiket):
 * kemandoran rawat → blok → sub blok → pupuk + metode → pekerja hadir → pokok & kg → Simpan.
 * Batas dosis dan estimasi upah dari tarif ERP tampil live. "Simpan & pekerja berikutnya"
 * mempertahankan blok, pupuk, dan metode untuk pekerja berikutnya. Mandor/kerani rawat bisa "Simpan & Lanjutkan":
 * tiket langsung maju ke tahap verifikasinya saat sinkron.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { NumberStepper } from '@/components/NumberStepper';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { attendanceByEmployee, isPresent } from '@/db/repositories/attendance';
import { fertilizationEstimate, fertilizers, rawatGangs, type FertilizationTicketRow } from '@/db/repositories/fertilization';
import { subBloksOf } from '@/db/repositories/harvest';
import { block, employee, fertilizationTicket } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { useRawatVerifier } from '@/features/entry/StageContinue';
import { saveFertilizationTicket } from '@/features/fertilization/actions';
import { continueTicket } from '@/features/harvest/stage';
import type { FertilizationMethod } from '@/features/fertilization/calc';
import { formatRupiah } from '@/features/harvest/calc';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { FERTILIZATION_METHODS, WEATHERS } from '@/sync/contract';
import { colors, radius, spacing } from '@/theme';

type Weather = NonNullable<FertilizationTicketRow['weather']>;

export default function NewFertilizationTicketScreen() {
  const services = useServices();
  const { db, clock } = services;
  const workDate = clock.workDate();
  const { correctionOf } = useLocalSearchParams<{ correctionOf?: string }>();
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);
  const verifier = useRawatVerifier();

  const original = useMemo(
    () =>
      correctionOf
        ? (db.select().from(fertilizationTicket).where(eq(fertilizationTicket.mobileUuid, correctionOf)).get() ?? null)
        : null,
    [correctionOf, db],
  );

  const gangs = useTableQuery(['gang'], () => rawatGangs(db, afdelingIds));
  const blocks = useTableQuery(['block'], () =>
    afdelingIds.length ? db.select().from(block).where(inArray(block.afdelingId, afdelingIds)).orderBy(asc(block.code)).all() : [],
  );
  const products = useTableQuery(['product'], () => fertilizers(db));

  const [gangId, setGangId] = useState<number | null>(original?.gangId ?? null);
  const [blockId, setBlockId] = useState<number | null>(original?.blockId ?? null);
  const [subBlokId, setSubBlokId] = useState<number | null>(original?.subBlokId ?? null);
  const [productId, setProductId] = useState<number | null>(original?.productId ?? null);
  const [method, setMethod] = useState<FertilizationMethod>(original?.method ?? 'manual');
  const [round, setRound] = useState(original?.applicationRound ?? 1);
  const [workerId, setWorkerId] = useState<number | null>(original?.workerEmployeeId ?? null);
  const [trees, setTrees] = useState(original?.treeCount ?? 0);
  const [qtyKg, setQtyKg] = useState(original?.qtyKg ?? 0);
  const [weather, setWeather] = useState<Weather | null>(original?.weather ?? null);
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const effGangId = gangId ?? gangs[0]?.id ?? null;
  const effBlockId = blockId ?? blocks[0]?.id ?? null;
  const theBlock = blocks.find((b) => b.id === effBlockId) ?? null;
  const subBloks = useTableQuery(['sub_blok', String(effBlockId)], () => (effBlockId ? subBloksOf(db, effBlockId) : []));
  const effSubBlokId = subBloks.some((x) => x.id === subBlokId) ? subBlokId : subBloks.length === 1 ? subBloks[0]!.id : null;
  const theProduct = products.find((p) => p.id === productId) ?? null;

  const day = useTableQuery(['attendance'], () => attendanceByEmployee(db, workDate));
  const workers = useMemo(() => {
    const ids = [...day.entries()]
      .filter(([, d]) => isPresent(d) && !d.checkOut && d.checkIn!.gangId === effGangId)
      .map(([id]) => id);
    if (original && !ids.includes(original.workerEmployeeId)) ids.push(original.workerEmployeeId);
    return ids.length ? db.select().from(employee).where(and(inArray(employee.id, ids))).orderBy(asc(employee.name)).all() : [];
  }, [day, effGangId, db, original]);

  // Versi master: berubah saat tarif/sub blok/karyawan/blok/pupuk tersinkron, memicu hitung ulang.
  const masterRev = useTableQuery(['harvest_rate', 'sub_blok', 'employee', 'block', 'product'], () => ({}));
  const estimate = useMemo(
    () =>
      fertilizationEstimate(db, {
        workDate,
        blockId: effBlockId,
        subBlokId: effSubBlokId,
        workerEmployeeId: workerId,
        productId,
        method,
        treeCount: trees,
        qtyKg,
      }),
    // masterRev sengaja jadi dependency: hitung ulang saat master tersinkron.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, workDate, effBlockId, effSubBlokId, workerId, productId, method, trees, qtyKg, masterRev],
  );
  const over = estimate.dosageStatus === 'over';

  /** `next`: tetap di form untuk pekerja berikutnya. `andContinue`: Simpan & Lanjutkan. */
  const save = async (next: boolean, andContinue = false) => {
    if (!effGangId || !effBlockId || !workerId || !productId) return;
    setBusy(true);
    try {
      const ctx = await services.txContext();
      const r = saveFertilizationTicket(db, ctx, {
        workDate,
        blockId: effBlockId,
        subBlokId: effSubBlokId,
        gangId: effGangId,
        workerEmployeeId: workerId,
        productId,
        method,
        applicationRound: round > 0 ? round : null,
        treeCount: trees,
        qtyKg,
        weather,
        notes: notes.trim() || null,
        correctionOf: original?.mobileUuid ?? null,
      });
      if (!r.ok) {
        Alert.alert(t('fertilization.title'), r.issues.map((i) => `• ${t(`fertilization.error.${i}`)}`).join('\n'));
        return;
      }
      if (andContinue) continueTicket(db, ctx, r.mobileUuid, 'fertilization_ticket');
      if (next) {
        const name = workers.find((w) => w.id === workerId)?.name ?? '';
        setWorkerId(null);
        setTrees(0);
        setQtyKg(0);
        setNotes('');
        Alert.alert(t('fertilization.title'), t('fertilization.savedNext', { worker: name }));
        return;
      }
      router.replace({ pathname: '/fertilization/[id]', params: { id: r.mobileUuid, fresh: '1' } });
    } finally {
      setBusy(false);
    }
  };

  const title = original ? t('fertilization.correction') : t('fertilization.new');
  const missing = gangs.length === 0 ? 'noGang' : blocks.length === 0 ? 'noBlock' : products.length === 0 ? 'noFertilizer' : null;
  if (missing) {
    return (
      <Screen title={title} back>
        <Card padded>
          <Txt>{t(`fertilization.${missing}`)}</Txt>
        </Card>
      </Screen>
    );
  }

  const canSave = !!effGangId && !!effBlockId && !!effSubBlokId && !!workerId && !!productId && trees > 0 && qtyKg > 0 && !over;

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
        {`${t('fertilization.block')}${theBlock?.treeCount ? ` · ${t('fertilization.blockTrees', { trees: theBlock.treeCount })}` : ''}`}
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

      <SectionTitle>{t('fertilization.fertilizer')}</SectionTitle>
      <View style={styles.grid}>
        {products.map((p) => (
          <Chip key={p.id} label={p.name} selected={p.id === productId} onPress={() => setProductId(p.id)} />
        ))}
      </View>
      {theProduct && (
        <Txt variant="small" style={{ color: colors.textMuted }}>
          {theProduct.dosageKgPerTree ? t('fertilization.dosage', { dosage: theProduct.dosageKgPerTree }) : t('fertilization.noDosage')}
        </Txt>
      )}

      <SectionTitle>{t('fertilization.method')}</SectionTitle>
      <View style={styles.grid}>
        {FERTILIZATION_METHODS.map((m) => (
          <Chip key={m} label={t(`fertilization.methods.${m}`)} selected={m === method} onPress={() => setMethod(m)} />
        ))}
      </View>

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

      <Card padded style={over ? { borderWidth: 2, borderColor: colors.danger } : undefined}>
        <NumberStepper label={t('fertilization.trees')} value={trees} onChange={(n) => setTrees(Math.max(0, Math.round(n)))} step={10} large />
        {estimate.treeLimit != null && (
          <Txt variant="small" style={{ color: trees > estimate.treeLimit ? colors.danger : colors.textMuted }}>
            {t('fertilization.treeLimit', { trees: estimate.treeLimit })}
          </Txt>
        )}
        <NumberStepper label={t('fertilization.qty')} value={qtyKg} onChange={(n) => setQtyKg(Math.max(0, n))} step={0.5} decimal />
        <View style={styles.summary}>
          <Txt style={{ flex: 1, color: colors.textMuted }}>{t('fertilization.maxQty')}</Txt>
          <Txt style={{ fontWeight: '700' }}>{estimate.maxQtyKg != null ? `${estimate.maxQtyKg} kg` : '—'}</Txt>
        </View>
        <View style={[styles.status, { backgroundColor: over ? colors.danger : colors.surfaceMuted }]}>
          <Txt style={{ fontWeight: '800', color: over ? colors.onDanger : colors.text }}>
            {t(`fertilization.dosageStatus.${estimate.dosageStatus}`)}
          </Txt>
        </View>
      </Card>

      <Card padded>
        <NumberStepper label={t('fertilization.round')} value={round} onChange={(n) => setRound(Math.max(0, Math.round(n)))} />
        <SectionTitle>{t('fertilization.weather')}</SectionTitle>
        <View style={styles.grid}>
          {WEATHERS.map((w) => (
            <Chip key={w} label={t(`fertilization.weathers.${w}`)} selected={w === weather} onPress={() => setWeather(w === weather ? null : w)} />
          ))}
        </View>
        <TextField label={t('fertilization.notes')} value={notes} onChangeText={setNotes} />
      </Card>

      <Card padded>
        <Txt variant="small" style={{ color: colors.textMuted }}>{t('fertilization.wage')}</Txt>
        <Txt style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{formatRupiah(estimate.wage.amount)}</Txt>
        {estimate.wage.line ? (
          <Txt variant="small" style={{ color: colors.textMuted }}>
            {t('fertilization.wageBasis', {
              qty: estimate.wage.quantity,
              unit: t(`fertilization.unit.${estimate.wage.line.basis}`),
              rate: formatRupiah(estimate.wage.line.amount),
            })}
          </Txt>
        ) : workerId && productId ? (
          <Txt variant="small" style={{ color: colors.warning }}>
            {t('fertilization.noRate')}
          </Txt>
        ) : null}
      </Card>

      {!original && (
        <Button kind="outline" icon="account-arrow-right" label={t('fertilization.saveNext')} busy={busy} disabled={!canSave} onPress={() => void save(true)} />
      )}
      <Button
        kind={verifier ? 'outline' : 'primary'}
        icon="content-save"
        label={t('fertilization.save')}
        busy={busy}
        disabled={!canSave}
        onPress={() => void save(false)}
      />
      {verifier && (
        <Button icon="check-decagram" label={t('harvest.saveContinue')} busy={busy} disabled={!canSave} onPress={() => void save(false, true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  status: { padding: spacing.sm, borderRadius: radius.sm },
});
