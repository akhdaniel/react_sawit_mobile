/**
 * Perawatan baru: kegiatan, blok, pekerja hadir, HK, luas/pokok realisasi, material dengan
 * cek dosis live (over-dose → catatan wajib, masuk antrean approval asisten).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ListRow } from '@/components/ListRow';
import { NumberStepper } from '@/components/NumberStepper';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { attendanceByEmployee, isPresent } from '@/db/repositories/attendance';
import { doseLimitsFor } from '@/db/repositories/upkeep';
import { activity, block, dosageRule, employee, product } from '@/db/schema';
import { useGangSelection } from '@/features/attendance/useGang';
import { useSession } from '@/features/auth/session-store';
import { CameraCapture, type CapturedPhoto } from '@/features/camera/CameraCapture';
import { formatRupiah } from '@/features/harvest/calc';
import { saveUpkeep } from '@/features/upkeep/actions';
import { isOverDose, upkeepWageEstimate } from '@/features/upkeep/calc';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

export default function NewUpkeepScreen() {
  const services = useServices();
  const { db, clock } = services;
  const workDate = clock.workDate();
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);
  const { gangs, selected, select } = useGangSelection();

  const activities = useTableQuery(['activity'], () => db.select().from(activity).where(eq(activity.kind, 'upkeep')).orderBy(asc(activity.code)).all());
  const blocks = useTableQuery(['block'], () =>
    afdelingIds.length ? db.select().from(block).where(inArray(block.afdelingId, afdelingIds)).orderBy(asc(block.code)).all() : [],
  );
  const day = useTableQuery(['attendance'], () => attendanceByEmployee(db, workDate));
  const workers = useMemo(() => {
    const ids = [...day.entries()].filter(([, d]) => isPresent(d) && !d.checkOut && (!selected || d.checkIn!.gangId === selected.id)).map(([id]) => id);
    return ids.length ? db.select().from(employee).where(and(inArray(employee.id, ids))).orderBy(asc(employee.name)).all() : [];
  }, [day, selected, db]);

  const [activityId, setActivityId] = useState<number | null>(null);
  const [blockId, setBlockId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [hk, setHk] = useState<number | null>(null);
  const [ha, setHa] = useState(0);
  const [trees, setTrees] = useState(0);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = activities.find((a) => a.id === activityId) ?? null;
  const blk = blocks.find((b) => b.id === blockId) ?? null;
  const chosen = picked ?? new Set(workers.map((w) => w.id));
  const effHk = hk ?? chosen.size;
  const realizedHa = act?.wageBasis === 'per_ha' ? ha : ha > 0 ? ha : null;
  const realizedTrees = act?.wageBasis === 'per_tree' ? trees : null;

  const rules = useTableQuery(['dosage_rule', String(activityId)], () =>
    activityId
      ? db
          .select({ productId: dosageRule.productId, name: product.name, uom: product.uom })
          .from(dosageRule)
          .innerJoin(product, eq(product.id, dosageRule.productId))
          .where(eq(dosageRule.activityId, activityId))
          .all()
      : [],
  );
  const limits = activityId ? doseLimitsFor(db, activityId, realizedHa) : new Map();
  const wage = upkeepWageEstimate(act, { hk: effHk, realizedHa, realizedTrees });

  const toggle = (id: number) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const save = async () => {
    const materials = rules
      .filter((r) => (qty[r.productId] ?? 0) > 0)
      .map((r) => ({ productId: r.productId, qty: qty[r.productId]!, approvalNote: notes[r.productId] ?? null }));
    setBusy(true);
    try {
      const r = saveUpkeep(
        db,
        await services.txContext(),
        { workDate, activityId: activityId ?? 0, blockId: blockId ?? 0, employeeIds: [...chosen], hk: effHk, realizedHa, realizedTrees },
        materials,
        photo ?? undefined,
      );
      if (!r.ok) {
        Alert.alert(t('upkeep.title'), r.issues.map((i) => `• ${t(`upkeep.error.${i.code}`)}`).join('\n'));
        return;
      }
      Alert.alert(t('upkeep.title'), r.overDose ? t('upkeep.savedOver', { count: r.overDose }) : t('upkeep.saved'));
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('upkeep.new')} back>
      {gangs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {gangs.map((g) => (
            <Chip key={g.id} label={g.name} selected={g.id === selected?.id} onPress={() => { select(g.id); setPicked(null); }} />
          ))}
        </ScrollView>
      )}

      <SectionTitle>{t('upkeep.activity')}</SectionTitle>
      {activities.length === 0 ? (
        <Card padded>
          <Txt>{t('upkeep.noActivity')}</Txt>
        </Card>
      ) : (
        <View style={styles.wrap}>
          {activities.map((a) => (
            <Chip key={a.id} label={a.name} selected={a.id === activityId} onPress={() => { setActivityId(a.id); setQty({}); setNotes({}); }} />
          ))}
        </View>
      )}

      <SectionTitle>{`${t('upkeep.block')}${blk ? ` · ${t('upkeep.blockHa', { ha: blk.ha })}` : ''}`}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {blocks.map((b) => (
          <Chip key={b.id} label={b.code} selected={b.id === blockId} onPress={() => setBlockId(b.id)} />
        ))}
      </ScrollView>

      <SectionTitle>{`${t('upkeep.workers')} (${chosen.size}/${workers.length})`}</SectionTitle>
      {workers.length === 0 ? (
        <Card padded>
          <Txt>{t('assignment.noPresent')}</Txt>
        </Card>
      ) : (
        <Card>
          {workers.map((w, i) => (
            <ListRow
              key={w.id}
              icon={chosen.has(w.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
              tone={chosen.has(w.id) ? 'success' : 'primary'}
              label={w.name}
              description={`${w.nik} · ${w.type}`}
              last={i === workers.length - 1}
              onPress={() => toggle(w.id)}
            />
          ))}
        </Card>
      )}

      <Card padded>
        <NumberStepper label={t('upkeep.hk')} value={effHk} onChange={setHk} step={0.5} decimal />
        {act?.wageBasis !== 'per_tree' && <NumberStepper label={t('upkeep.realizedHa')} value={ha} onChange={setHa} step={0.5} decimal />}
        {act?.wageBasis === 'per_tree' && <NumberStepper label={t('upkeep.realizedTrees')} value={trees} onChange={setTrees} step={10} />}
      </Card>

      {act && (
        <>
          <SectionTitle>{t('upkeep.materials')}</SectionTitle>
          {rules.length === 0 ? (
            <Card padded>
              <Txt>{t('upkeep.noRules')}</Txt>
            </Card>
          ) : (
            rules.map((r) => {
              const limit = limits.get(r.productId) ?? null;
              const q = qty[r.productId] ?? 0;
              const over = isOverDose(q, limit);
              return (
                <Card key={r.productId} padded style={over ? { borderWidth: 2, borderColor: colors.danger } : undefined}>
                  <NumberStepper label={`${r.name} (${r.uom})`} value={q} onChange={(n) => setQty((c) => ({ ...c, [r.productId]: n }))} step={0.5} decimal />
                  <Txt variant="small" style={{ color: colors.textMuted }}>
                    {limit ? t('upkeep.standard', { std: limit.standard, max: limit.max, uom: r.uom }) : t('upkeep.noLimit')}
                  </Txt>
                  {over && (
                    <>
                      <View style={styles.over}>
                        <Txt style={{ color: colors.onDanger, fontWeight: '800' }}>{t('upkeep.overDose')}</Txt>
                      </View>
                      <TextField label={t('upkeep.note')} value={notes[r.productId] ?? ''} onChangeText={(v) => setNotes((c) => ({ ...c, [r.productId]: v }))} />
                    </>
                  )}
                </Card>
              );
            })
          )}
        </>
      )}

      <Card padded>
        <Txt variant="small" style={{ color: colors.textMuted }}>{t('upkeep.wage')}</Txt>
        <Txt style={{ fontSize: 24, fontWeight: '800', color: colors.success }}>{formatRupiah(wage)}</Txt>
      </Card>

      <Button kind="outline" icon={photo ? 'check-circle' : 'camera'} label={photo ? t('harvest.photoTaken') : t('upkeep.photo')} onPress={() => setCamera(true)} />
      <Button icon="content-save" label={t('upkeep.save')} busy={busy} disabled={!activityId || !blockId || chosen.size === 0} onPress={() => void save()} />
      <CameraCapture visible={camera} title={t('upkeep.photo')} onCaptured={(p) => { setPhoto(p); setCamera(false); }} onCancel={() => setCamera(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  over: { backgroundColor: colors.danger, padding: spacing.sm, borderRadius: radius.sm },
});
