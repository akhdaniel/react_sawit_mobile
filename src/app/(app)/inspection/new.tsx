/**
 * Inspeksi baru, 3 langkah: jenis (template sesuai peran) → blok (terdekat dari GPS) + TPH/pemanen/kemandoran
 * opsional → checklist. Checklist: satu kartu per item (≤ 3 ketukan), item buruk merah dengan "+ Temuan";
 * taksasi menampilkan AKP & estimasi besok, sensus membandingkan hitungan dengan master blok. Skor & LULUS/TIDAK
 * LULUS tampil live dengan rumus ERP. Bekerja penuh tanpa sinyal; koreksi membuka langkah checklist langsung.
 */
import { asc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { NumberStepper } from '@/components/NumberStepper';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { presentEmployeeIds } from '@/db/repositories/attendance';
import {
  inspectionBlocks,
  inspectionFindings,
  inspectionScore,
  isSelfInspection,
  taksasiEstimate,
  templateItems,
  templatesForRoles,
  type InspectionTemplateRow,
} from '@/db/repositories/inspection';
import { block, employee, gang, inspection, tph, type InspectionLine, type InspectionSensus } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { CameraCapture, type CapturedPhoto } from '@/features/camera/CameraCapture';
import { saveInspection } from '@/features/inspection/actions';
import { isBad, lineValue, MAX_RIPE_PER_TREE } from '@/features/inspection/calc';
import { FindingSheet, type FindingDraft, type FindingPreset } from '@/features/inspection/FindingSheet';
import { emptyLine, ItemInput } from '@/features/inspection/ItemInput';
import { useSecurity } from '@/features/security/security-store';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { INSPECTION_TYPES, type FindingSeverity, type InspectionType } from '@/sync/contract';
import { colors, radius, spacing, touch } from '@/theme';

type Step = 1 | 2 | 3;
const EMPTY_SENSUS: InspectionSensus = { tree_count_productive: 0, tree_count_sisipan: 0, tree_count_dead: 0, tree_count_abnormal: 0 };
/** Jenis yang menilai pekerjaan kemandoran/pemanen (pilihan opsional di langkah blok). */
const ASSESSES_WORK: readonly InspectionType[] = ['mutu_panen', 'mutu_rawat'];

const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

export default function NewInspectionScreen() {
  const services = useServices();
  const { db, clock } = services;
  const workDate = clock.workDate();
  const { correctionOf } = useLocalSearchParams<{ correctionOf?: string }>();
  const user = useSession((s) => s.user);
  const roles = useMemo(() => user?.roles ?? [], [user]);
  const afdelingIds = useMemo(() => user?.afdeling_ids ?? [], [user]);
  const fix = useSecurity((s) => s.lastFix);

  const original = useMemo(
    () => (correctionOf ? (db.select().from(inspection).where(eq(inspection.mobileUuid, correctionOf)).get() ?? null) : null),
    [correctionOf, db],
  );

  const templates = useTableQuery(['inspection_template'], () => templatesForRoles(db, roles));
  const [step, setStep] = useState<Step>(original ? 3 : 1);
  /** Jenis dengan lebih dari satu template: pilih templatenya di kartu jenis. */
  const [pickedType, setPickedType] = useState<InspectionType | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(original?.templateId ?? null);
  const [blockId, setBlockId] = useState<number | null>(original?.blockId ?? null);
  const [tphId, setTphId] = useState<number | null>(original?.tphId ?? null);
  const [harvesterId, setHarvesterId] = useState<number | null>(original?.harvesterEmployeeId ?? null);
  const [gangId, setGangId] = useState<number | null>(original?.gangId ?? null);
  const [sampleSize, setSampleSize] = useState(original?.sampleSize ?? 1);
  const [lines, setLines] = useState<Record<number, InspectionLine>>(() =>
    Object.fromEntries((original?.lines ?? []).map((l) => [l.item_id, l])),
  );
  const [sampled, setSampled] = useState(original?.taksasi?.sampled_trees ?? 0);
  const [ripe, setRipe] = useState(original?.taksasi?.ripe_bunches_counted ?? 0);
  const [sensus, setSensus] = useState<InspectionSensus>(original?.sensus ?? EMPTY_SENSUS);
  // Koreksi membawa temuan asal dengan UUID baru (temuan asal yang sudah diposting ada di ERP).
  const [findings, setFindings] = useState<FindingDraft[]>(() =>
    correctionOf
      ? inspectionFindings(db, correctionOf).map((f) => ({
          finding: {
            findingUuid: randomUUID(),
            itemId: f.itemId,
            category: f.category,
            severity: f.severity,
            description: f.description,
            rowNo: f.rowNo,
            treeNo: f.treeNo,
            palmTreeQr: f.palmTreeQr,
            lat: f.lat,
            lng: f.lng,
            photoIds: f.photoIds,
          },
          photos: [],
        }))
      : [],
  );
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [preset, setPreset] = useState<FindingPreset | null>(null);
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void services.refreshLocation().catch(() => undefined);
  }, [services]);

  const template: InspectionTemplateRow | null = templates.find((x) => x.id === templateId) ?? null;
  const type = template?.inspectionType ?? null;
  const items = useTableQuery(['inspection_item', String(templateId)], () => (templateId ? templateItems(db, templateId) : []));
  const blocks = useTableQuery(['block', 'tph', fix ? `${fix.lat.toFixed(4)},${fix.lng.toFixed(4)}` : '-'], () =>
    inspectionBlocks(db, afdelingIds, fix ? { lat: fix.lat, lng: fix.lng } : null),
  );
  const theBlock = useTableQuery(['block', String(blockId)], () => (blockId ? (db.select().from(block).where(eq(block.id, blockId)).get() ?? null) : null));
  const tphs = useTableQuery(['tph', String(blockId)], () =>
    blockId ? db.select().from(tph).where(eq(tph.blockId, blockId)).orderBy(asc(tph.code)).all() : [],
  );
  const gangs = useTableQuery(['gang'], () =>
    afdelingIds.length ? db.select().from(gang).where(inArray(gang.afdelingId, afdelingIds)).orderBy(asc(gang.name)).all() : [],
  );
  const harvesters = useTableQuery(['attendance', 'employee'], () => {
    const ids = [...presentEmployeeIds(db, workDate)];
    return ids.length ? db.select().from(employee).where(inArray(employee.id, ids)).orderBy(asc(employee.name)).all() : [];
  });

  const fullLines = useMemo(() => items.map((i) => lines[i.id] ?? emptyLine(i.id)), [items, lines]);
  const score = useTableQuery(['inspection_item', 'inspection_template', JSON.stringify(fullLines), String(templateId)], () =>
    templateId ? inspectionScore(db, templateId, fullLines) : null,
  );
  const estimate = useTableQuery(['block', String(blockId), `${sampled}/${ripe}`], () =>
    blockId ? taksasiEstimate(db, blockId, { sampled_trees: sampled, ripe_bunches_counted: ripe }) : null,
  );
  const self = useTableQuery(['gang', 'employee', `${gangId}/${harvesterId}`], () =>
    isSelfInspection(db, { gangId, harvesterEmployeeId: harvesterId }, user?.employee_id),
  );

  const selectTemplate = (x: InspectionTemplateRow) => {
    setTemplateId(x.id);
    setSampleSize(x.defaultSampleSize || 1);
    if (x.inspectionType === 'taksasi' && !sampled) setSampled(x.defaultSampleSize);
    setLines({});
    setFindings([]);
    setStep(2);
  };

  const addFindingFor = (itemId: number) => {
    const item = items.find((i) => i.id === itemId)!;
    const value = lineValue(item, lines[itemId]);
    setPreset({
      itemId,
      itemName: item.name,
      category: item.findingCategory,
      severity: item.findingSeverity as FindingSeverity,
      description: `${item.name}: ${typeof value === 'boolean' ? t(value ? 'inspection.yes' : 'inspection.no') : (value ?? '')}${item.uom ? ` ${item.uom}` : ''}`,
    });
  };

  const save = async () => {
    if (!template || !blockId) return;
    setBusy(true);
    try {
      const ctx = await services.txContext();
      const r = saveInspection(
        db,
        ctx,
        {
          workDate,
          templateId: template.id,
          blockId,
          tphId,
          harvesterEmployeeId: harvesterId,
          gangId,
          sampleSize,
          lines: fullLines,
          // Lokasi temuan = lokasi saat inspeksi disimpan.
          findings: findings.map((f) => ({ ...f.finding, lat: ctx.fix?.lat ?? null, lng: ctx.fix?.lng ?? null })),
          taksasi: type === 'taksasi' ? { sampled_trees: sampled, ripe_bunches_counted: ripe, harvest_date_target: nextDay(workDate) } : null,
          sensus: type === 'sensus' ? sensus : null,
          photoIds: photos.map((p) => p.id),
          correctionOf: original?.mobileUuid ?? null,
        },
        { roles, employeeId: user?.employee_id },
        [...photos, ...findings.flatMap((f) => f.photos)],
      );
      if (!r.ok) {
        Alert.alert(t('inspection.title'), r.issues.map((i) => `• ${t(`inspection.error.${i}`)}`).join('\n'));
        return;
      }
      router.replace({ pathname: '/inspection/[id]', params: { id: r.mobileUuid, fresh: '1' } });
    } finally {
      setBusy(false);
    }
  };

  const title = original ? t('inspection.correction') : t('inspection.new');
  const stepName = t(`inspection.step.${({ 1: 'type', 2: 'block', 3: 'checklist' } as const)[step]}`);

  if (templates.length === 0 || blocks.length === 0) {
    return (
      <Screen title={title} back>
        <Card padded>
          <Txt>{t(templates.length === 0 ? 'inspection.noTemplate' : 'inspection.noBlock')}</Txt>
        </Card>
      </Screen>
    );
  }

  const progress = (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step }}>
      {([1, 2, 3] as const).map((n) => (
        <View key={n} style={[styles.progressBar, n <= step && { backgroundColor: colors.primary }]} />
      ))}
      <Txt variant="small" style={{ color: colors.textMuted }}>{t('inspection.stepOf', { n: step, name: stepName })}</Txt>
    </View>
  );

  // ---- Langkah 1: jenis --------------------------------------------------------
  if (step === 1) {
    const types = INSPECTION_TYPES.filter((x) => templates.some((tp) => tp.inspectionType === x));
    return (
      <Screen title={title} back>
        {progress}
        <View style={styles.grid}>
          {types.map((x) => {
            const own = templates.filter((tp) => tp.inspectionType === x);
            return (
              <Pressable
                key={x}
                accessibilityRole="button"
                onPress={() => (own.length === 1 ? selectTemplate(own[0]!) : setPickedType(x))}
                style={({ pressed }) => [styles.typeCard, pressed && { backgroundColor: colors.primarySoft }]}
              >
                <Icon name="clipboard-check-outline" size={32} color={colors.primary} />
                <Txt style={{ fontWeight: '800' }}>{t(`inspection.types.${x}`)}</Txt>
                <Txt variant="small" style={{ color: colors.textMuted }}>{t(`inspection.typeHint.${x}`)}</Txt>
                {own.length > 1 && pickedType === x && (
                  <View style={styles.wrap}>
                    {own.map((tp) => (
                      <Chip key={tp.id} label={tp.name} onPress={() => selectTemplate(tp)} />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Screen>
    );
  }

  // ---- Langkah 2: blok ---------------------------------------------------------
  if (step === 2) {
    const assesses = type != null && ASSESSES_WORK.includes(type);
    return (
      <Screen title={title} back>
        {progress}
        <SectionTitle>{`${t('inspection.template')}: ${template?.name ?? ''}`}</SectionTitle>
        <SectionTitle>{t('inspection.block')}</SectionTitle>
        <View style={styles.grid}>
          {blocks.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityState={{ selected: b.id === blockId }}
              onPress={() => {
                setBlockId(b.id);
                setTphId(null);
              }}
              style={[styles.blockCard, b.id === blockId && styles.blockOn]}
            >
              <Txt style={{ fontWeight: '800', fontSize: 20, color: b.id === blockId ? colors.onPrimary : colors.text }}>{b.code}</Txt>
              <Txt variant="small" style={{ color: b.id === blockId ? colors.onPrimary : colors.textMuted }}>
                {t('inspection.blockInfo', { status: b.status, year: b.plantingYear ?? '—' })}
              </Txt>
              {b.distanceM != null && (
                <Txt variant="small" style={{ color: b.id === blockId ? colors.onPrimary : colors.textMuted }}>
                  {t('inspection.distance', { distance: fmtDistance(b.distanceM) })}
                </Txt>
              )}
            </Pressable>
          ))}
        </View>

        {blockId != null && type === 'mutu_panen' && tphs.length > 0 && (
          <>
            <SectionTitle>{t('inspection.tph')}</SectionTitle>
            <View style={styles.wrap}>
              <Chip label={t('inspection.optionalNone')} selected={tphId == null} onPress={() => setTphId(null)} />
              {tphs.map((x) => (
                <Chip key={x.id} label={x.code} selected={x.id === tphId} onPress={() => setTphId(x.id)} />
              ))}
            </View>
          </>
        )}
        {assesses && type === 'mutu_panen' && (
          <>
            <SectionTitle>{t('inspection.harvester')}</SectionTitle>
            <Txt variant="small" style={{ color: colors.textMuted }}>{t('inspection.harvesterHint')}</Txt>
            <View style={styles.wrap}>
              <Chip label={t('inspection.optionalNone')} selected={harvesterId == null} onPress={() => setHarvesterId(null)} />
              {harvesters.map((e) => (
                <Chip key={e.id} label={e.name} selected={e.id === harvesterId} onPress={() => setHarvesterId(e.id)} />
              ))}
            </View>
          </>
        )}
        {assesses && (
          <>
            <SectionTitle>{t('inspection.gang')}</SectionTitle>
            <View style={styles.wrap}>
              <Chip label={t('inspection.optionalNone')} selected={gangId == null} onPress={() => setGangId(null)} />
              {gangs.map((g) => (
                <Chip key={g.id} label={g.name} selected={g.id === gangId} onPress={() => setGangId(g.id)} />
              ))}
            </View>
          </>
        )}
        {type !== 'taksasi' && type !== 'sensus' && (
          <Card padded>
            <NumberStepper
              label={t('inspection.sampleSize', { unit: t(`inspection.sampleUnits.${(template?.sampleUnit ?? 'titik') as 'titik'}`) })}
              value={sampleSize}
              onChange={(n) => setSampleSize(Math.max(0, Math.round(n)))}
            />
          </Card>
        )}
        <View style={styles.nav}>
          <View style={{ flex: 1 }}>
            <Button kind="outline" icon="arrow-left" label={t('inspection.back')} onPress={() => setStep(1)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button icon="arrow-right" label={t('inspection.next')} disabled={blockId == null} onPress={() => setStep(3)} />
          </View>
        </View>
      </Screen>
    );
  }

  // ---- Langkah 3: checklist ----------------------------------------------------
  const findingItems = new Set(findings.map((f) => f.finding.itemId));
  const hasScore = score?.result != null;
  return (
    <Screen title={title} subtitle={`${type ? t(`inspection.types.${type}`) : ''} · ${t('inspection.block')} ${theBlock?.code ?? ''}`} back>
      {!original && progress}

      {type === 'taksasi' && estimate && (
        <Card padded>
          <NumberStepper label={t('inspection.taksasi.sampledTrees')} value={sampled} onChange={(n) => setSampled(Math.max(0, Math.round(n)))} large />
          <NumberStepper label={t('inspection.taksasi.ripe')} value={ripe} onChange={(n) => setRipe(Math.max(0, Math.round(n)))} large />
          {ripe > sampled * MAX_RIPE_PER_TREE && <Txt style={{ color: colors.danger, fontWeight: '700' }}>{t('inspection.error.invalid_taksasi')}</Txt>}
          <View style={styles.stats}>
            <Stat label={t('inspection.taksasi.akp')} value={`${estimate.akpPct.toFixed(1)}%`} />
            <Stat label={t('inspection.taksasi.estBunches')} value={Math.round(estimate.estBunches).toLocaleString('id-ID')} />
            <Stat label={t('inspection.taksasi.estKg')} value={`${Math.round(estimate.estKg).toLocaleString('id-ID')} kg`} />
          </View>
          {theBlock?.treeCountProductive ? (
            <Txt variant="small" style={{ color: colors.textMuted }}>
              {t('inspection.taksasi.basis', { trees: theBlock.treeCountProductive, bjr: theBlock.bjrKg })}
            </Txt>
          ) : (
            <Txt variant="small" style={{ color: colors.danger, fontWeight: '700' }}>{t('inspection.taksasi.noProductive')}</Txt>
          )}
        </Card>
      )}

      {type === 'sensus' && (
        <Card padded>
          {(
            [
              ['tree_count_productive', 'productive', theBlock?.treeCountProductive],
              ['tree_count_sisipan', 'sisipan', theBlock?.treeCountSisipan],
              ['tree_count_dead', 'dead', theBlock?.treeCountDead],
              ['tree_count_abnormal', 'abnormal', null],
            ] as const
          ).map(([key, label, master]) => (
            <View key={key} style={{ gap: spacing.xs }}>
              <NumberStepper
                label={t(`inspection.sensus.${label}`)}
                value={sensus[key]}
                onChange={(n) => setSensus((s) => ({ ...s, [key]: Math.max(0, Math.round(n)) }))}
                step={10}
              />
              {master != null && (
                <Txt variant="small" style={{ color: colors.textMuted }}>{t('inspection.sensus.master', { count: master })}</Txt>
              )}
            </View>
          ))}
        </Card>
      )}

      {items.length > 0 && <SectionTitle>{t('inspection.checklist')}</SectionTitle>}
      {items.map((item) => {
        const line = lines[item.id] ?? emptyLine(item.id);
        return (
          <ItemInput
            key={item.id}
            item={item}
            line={line}
            bad={isBad(item, lineValue(item, line))}
            hasFinding={findingItems.has(item.id)}
            onChange={(l) => setLines((ls) => ({ ...ls, [item.id]: l }))}
            onAddFinding={() => addFindingFor(item.id)}
          />
        );
      })}

      <SectionTitle>{t('inspection.findings', { count: findings.length })}</SectionTitle>
      {findings.map((f, i) => (
        <Card key={f.finding.findingUuid} padded style={f.finding.severity === 'critical' ? { borderWidth: 2, borderColor: colors.danger } : undefined}>
          <View style={styles.head}>
            <StatusPill
              label={t(`finding.severities.${f.finding.severity}`)}
              tone={f.finding.severity === 'critical' ? 'danger' : f.finding.severity === 'major' ? 'warning' : 'neutral'}
            />
            <Txt style={{ flex: 1, fontWeight: '700' }}>{t(`finding.categories.${f.finding.category as 'lainnya'}`)}</Txt>
            <Pressable accessibilityRole="button" onPress={() => setFindings((fs) => fs.filter((_, j) => j !== i))}>
              <Txt style={{ color: colors.danger, fontWeight: '700' }}>{t('inspection.removeFinding')}</Txt>
            </Pressable>
          </View>
          <Txt>{f.finding.description}</Txt>
          {(f.finding.rowNo || f.finding.treeNo) && (
            <Txt variant="small" style={{ color: colors.textMuted }}>
              {t('finding.location', { row: f.finding.rowNo ?? '—', tree: f.finding.treeNo ?? '—' })}
            </Txt>
          )}
        </Card>
      ))}
      <Button
        kind="outline"
        icon="alert-plus"
        label={t('inspection.addGeneralFinding')}
        onPress={() => setPreset({ itemId: null, category: null, severity: 'minor', description: '' })}
      />

      <SectionTitle>{t('inspection.photos')}</SectionTitle>
      {photos.length > 0 && (
        <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
          {photos.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="imagebutton" onPress={() => setPreview(i)}>
              <Image source={{ uri: p.localUri }} style={styles.img} accessibilityLabel={t('inspection.photos')} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Button kind="outline" icon="camera" label={t('inspection.addPhoto')} onPress={() => setCamera(true)} />

      <Card padded style={styles.footer}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Txt variant="small" style={{ color: colors.textMuted }}>
              {t('inspection.score')}
              {template && hasScore ? ` · ${t('inspection.passLimit', { pct: template.passScorePct })}` : ''}
            </Txt>
            <Txt style={{ fontSize: 32, fontWeight: '800' }}>{hasScore ? `${score!.scorePct.toFixed(1)}%` : t('inspection.noScore')}</Txt>
          </View>
          {hasScore && <StatusPill label={t(score!.result === 'pass' ? 'inspection.pass' : 'inspection.fail')} tone={score!.result === 'pass' ? 'success' : 'danger'} />}
        </View>
        {self && <Txt variant="small" style={{ color: colors.textMuted }}>{t('inspection.selfHint')}</Txt>}
        <View style={styles.nav}>
          {!original && (
            <View style={{ flex: 1 }}>
              <Button kind="outline" icon="arrow-left" label={t('inspection.back')} onPress={() => setStep(2)} />
            </View>
          )}
          <View style={{ flex: 2 }}>
            <Button icon="content-save" label={t('inspection.save')} busy={busy} disabled={!blockId} onPress={() => void save()} />
          </View>
        </View>
      </Card>

      <FindingSheet
        preset={preset}
        onClose={() => setPreset(null)}
        onSave={(draft) => {
          setFindings((fs) => [...fs, draft]);
          setPreset(null);
        }}
      />
      <PhotoViewer uris={photos.map((p) => p.localUri)} index={preview} onClose={() => setPreview(null)} />
      <CameraCapture
        visible={camera}
        title={t('inspection.photos')}
        onCaptured={(p) => {
          setPhotos((ps) => [...ps, p]);
          setCamera(false);
        }}
        onCancel={() => setCamera(false)}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="small" style={{ color: colors.textMuted }}>{label}</Txt>
      <Txt style={{ fontSize: 20, fontWeight: '800' }}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { gap: spacing.xs, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  progressBar: { flex: 1, minWidth: 60, height: 6, borderRadius: 3, backgroundColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeCard: {
    width: '48%',
    minHeight: 132,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  blockCard: {
    minWidth: 104,
    minHeight: touch.minSize + 24,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  blockOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  nav: { flexDirection: 'row', gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexGrow: 1, minWidth: 96, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  img: { width: 120, height: 90, borderRadius: radius.md },
  footer: { borderWidth: 2, borderColor: colors.primary },
});
