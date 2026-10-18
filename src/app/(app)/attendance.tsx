/**
 * Absensi harian per kemandoran. Alur tercepat (3 ketukan): "Absen masuk semua" →
 * (alasan terlambat bila lewat jam masuk) → foto grup dari kamera aplikasi → tersimpan.
 */
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { StatusPill, type PillTone } from '@/components/StatusPill';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import {
  attendanceByEmployee,
  defaultCheckInStatus,
  isPresent,
  type AttendanceIssue,
  type AttendanceRow,
  type AttStatus,
  type DayAttendance,
} from '@/db/repositories/attendance';
import { employee, gang } from '@/db/schema';
import { checkIn, checkOut, correctCheckIn, type AttendanceResult } from '@/features/attendance/actions';
import { useGangSelection } from '@/features/attendance/useGang';
import { useSession } from '@/features/auth/session-store';
import { CameraCapture, type CapturedPhoto } from '@/features/camera/CameraCapture';
import { t } from '@/i18n/id';
import { appConfig } from '@/lib/config';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

type Employee = typeof employee.$inferSelect;

/** Pekerjaan yang menunggu foto dari kamera. */
type PendingCapture =
  | { kind: 'checkInAll'; employeeIds: number[]; status: AttStatus; lateReason: string | null }
  | { kind: 'checkInOne'; employeeId: number; status: AttStatus; lateReason: string | null }
  | { kind: 'correct'; original: AttendanceRow; status: AttStatus; lateReason: string | null };

/** Omit yang mempertahankan union (per anggota). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type CaptureRequest = DistributiveOmit<PendingCapture, 'lateReason'>;
/** Status yang menunggu alasan terlambat sebelum lanjut. */
type PendingLate = CaptureRequest | null;

const ABSENCE: AttStatus[] = ['sakit', 'izin', 'mangkir'];

function statusOf(d: DayAttendance | undefined): { label: string; tone: PillTone } {
  if (!d?.checkIn) return { label: t('attendance.status.belum'), tone: 'neutral' };
  if (d.checkOut) return { label: t('attendance.status.pulang'), tone: 'primary' };
  const s = d.checkIn.attStatus;
  return { label: t(`attendance.status.${s}`), tone: s === 'hadir' ? 'success' : s === 'terlambat' ? 'warning' : 'danger' };
}

function issueText(db: ReturnType<typeof useServices>['db'], issues: AttendanceIssue[]): string {
  const ids = issues.map((i) => i.employeeId);
  const names = new Map(db.select({ id: employee.id, name: employee.name }).from(employee).where(inArray(employee.id, ids)).all().map((e) => [e.id, e.name]));
  return issues.map((i) => `• ${names.get(i.employeeId) ?? `#${i.employeeId}`}: ${t(`attendance.error.${i.code}`, { gang: i.otherGang ?? '' })}`).join('\n');
}

export default function AttendanceScreen() {
  const services = useServices();
  const { db, clock } = services;
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);
  const { gangs, selected, select } = useGangSelection();
  const gangNames = useTableQuery(['gang'], () => new Map(db.select({ id: gang.id, name: gang.name }).from(gang).all().map((g) => [g.id, g.name])));
  const workDate = clock.workDate();

  const members = useTableQuery(['employee', 'attendance', String(selected?.id)], () =>
    selected ? db.select().from(employee).where(and(eq(employee.gangId, selected.id), eq(employee.active, true))).orderBy(asc(employee.name)).all() : [],
  );
  const day = useTableQuery(['attendance'], () => attendanceByEmployee(db, workDate));
  // Pekerja gang lain yang absen di gang ini hari ini.
  const borrowed = useMemo(() => {
    if (!selected) return [] as Employee[];
    const ids = [...day.entries()].filter(([id, d]) => d.checkIn?.gangId === selected.id && !members.some((m) => m.id === id)).map(([id]) => id);
    return ids.length ? db.select().from(employee).where(inArray(employee.id, ids)).all() : [];
  }, [day, members, selected, db]);
  const workers = [...members, ...borrowed];

  const notYet = members.filter((m) => !day.get(m.id)?.checkIn);
  const present = workers.filter((w) => isPresent(day.get(w.id)) && day.get(w.id)!.checkIn!.gangId === selected?.id);
  const toCheckOut = present.filter((w) => !day.get(w.id)!.checkOut);
  const absent = workers.filter((w) => day.get(w.id)?.checkIn && !isPresent(day.get(w.id)));
  const checkedOut = present.filter((w) => day.get(w.id)!.checkOut);

  const [lateFor, setLateFor] = useState<PendingLate>(null);
  const [lateReason, setLateReason] = useState('');
  const [capture, setCapture] = useState<PendingCapture | null>(null);
  const [sheetFor, setSheetFor] = useState<Employee | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showResult = (r: AttendanceResult) => {
    if (!r.ok) {
      Alert.alert(t('attendance.title'), issueText(db, r.issues));
      return;
    }
    const notes = [t('attendance.saved', { count: r.count })];
    if (r.outside) notes.push(t('attendance.outside'));
    if (r.noLocation) notes.push(t('attendance.noLocation'));
    setToast(notes.join(' · '));
    setTimeout(() => setToast(null), 4000);
  };

  /** Lanjutkan ke kamera, atau minta alasan dulu bila terlambat. */
  const proceed = (p: CaptureRequest) => {
    if (p.status === 'terlambat') {
      setLateReason('');
      setLateFor(p);
    } else setCapture({ ...p, lateReason: null });
  };

  const onCaptured = async (photo: CapturedPhoto) => {
    const job = capture;
    setCapture(null);
    if (!job || !selected) return;
    setBusy(true);
    try {
      const ctx = await services.txContext();
      if (job.kind === 'checkInAll') {
        showResult(checkIn(db, ctx, { workDate, gangId: selected.id, photo, entries: job.employeeIds.map((employeeId) => ({ employeeId, attStatus: job.status, lateReason: job.lateReason })) }));
      } else if (job.kind === 'checkInOne') {
        showResult(checkIn(db, ctx, { workDate, gangId: selected.id, photo, entries: [{ employeeId: job.employeeId, attStatus: job.status, lateReason: job.lateReason }] }));
      } else {
        showResult(correctCheckIn(db, ctx, job.original, job.status, job.lateReason, photo));
      }
    } finally {
      setBusy(false);
    }
  };

  const saveWithoutPhoto = async (fn: (ctx: Awaited<ReturnType<typeof services.txContext>>) => AttendanceResult) => {
    setBusy(true);
    try {
      showResult(fn(await services.txContext()));
    } finally {
      setBusy(false);
    }
  };

  const defaultStatus = () => defaultCheckInStatus(clock.now().ms, clock.utcOffsetMinutes, appConfig.workStartTime);

  const others = useTableQuery(['employee', String(otherOpen)], () =>
    otherOpen && selected
      ? db
          .select({ e: employee, gangName: gang.name })
          .from(employee)
          .innerJoin(gang, eq(gang.id, employee.gangId))
          .where(and(eq(employee.active, true), ne(employee.gangId, selected.id), inArray(gang.afdelingId, afdelingIds)))
          .orderBy(asc(employee.name))
          .all()
      : [],
  );
  const q = query.trim().toLowerCase();
  const filteredOthers = others.filter((o) => !q || o.e.name.toLowerCase().includes(q) || o.e.nik.includes(q)).slice(0, 50);

  const sheetDay = sheetFor ? day.get(sheetFor.id) : undefined;

  return (
    <Screen title={t('attendance.title')} subtitle={new Date(clock.now().ms).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })} back>
      {gangs.length === 0 ? (
        <Card padded>
          <Txt>{t('attendance.noGang')}</Txt>
        </Card>
      ) : (
        <>
          <SectionTitle>{t('attendance.gang')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {gangs.map((g) => (
              <Chip key={g.id} label={g.name} selected={g.id === selected?.id} onPress={() => select(g.id)} />
            ))}
          </ScrollView>

          <Card padded>
            <View style={styles.stats}>
              <Stat value={present.length} label={t('attendance.present')} color={colors.success} />
              <Stat value={notYet.length} label={t('attendance.notYet')} color={colors.textMuted} />
              <Stat value={absent.length} label={t('attendance.absent')} color={colors.danger} />
              <Stat value={checkedOut.length} label={t('attendance.checkedOut')} color={colors.primary} />
            </View>
            <Button
              icon="camera-account"
              label={t('attendance.checkInAll', { count: notYet.length })}
              disabled={notYet.length === 0}
              busy={busy}
              onPress={() => proceed({ kind: 'checkInAll', employeeIds: notYet.map((w) => w.id), status: defaultStatus() })}
            />
            <Button
              kind="outline"
              icon="home-export-outline"
              label={t('attendance.checkOutAll', { count: toCheckOut.length })}
              disabled={toCheckOut.length === 0 || busy}
              onPress={() => void saveWithoutPhoto((ctx) => checkOut(db, ctx, { workDate, gangId: selected!.id, employeeIds: toCheckOut.map((w) => w.id) }))}
            />
          </Card>

          {!!toast && (
            <View style={styles.toast} accessibilityRole="alert">
              <Icon name="check-circle" size={24} color={colors.success} />
              <Txt style={{ flex: 1, fontWeight: '700' }}>{toast}</Txt>
            </View>
          )}

          <SectionTitle>{`${t('attendance.workers')} (${workers.length})`}</SectionTitle>
          {workers.length === 0 ? (
            <Card padded>
              <Txt>{t('attendance.noWorkers')}</Txt>
            </Card>
          ) : (
            <Card>
              {workers.map((w, i) => {
                const st = statusOf(day.get(w.id));
                const isBorrowed = w.gangId !== selected?.id;
                return (
                  <WorkerRow
                    key={w.id}
                    worker={w}
                    sub={`${w.nik} · ${w.type}${isBorrowed ? ` · ${t('attendance.borrowed', { gang: gangNames.get(w.gangId ?? 0) ?? `#${w.gangId}` })}` : ''}`}
                    status={st}
                    last={i === workers.length - 1}
                    onPress={() => setSheetFor(w)}
                  />
                );
              })}
            </Card>
          )}
          <Button kind="outline" icon="account-plus" label={t('attendance.addOther')} onPress={() => setOtherOpen(true)} />
        </>
      )}

      {/* Alasan terlambat */}
      <Sheet visible={!!lateFor} title={t('attendance.lateTitle')} onClose={() => setLateFor(null)}>
        <Txt>{t('attendance.lateHint', { time: appConfig.workStartTime })}</Txt>
        <View style={styles.wrap}>
          {t('attendance.lateReasons').split('|').map((r) => (
            <Chip key={r} label={r} selected={lateReason === r} onPress={() => setLateReason(r)} />
          ))}
        </View>
        <TextField label={t('attendance.lateReason')} value={lateReason} onChangeText={setLateReason} />
        <Button
          icon="camera"
          label={t('attendance.continue')}
          disabled={!lateReason.trim()}
          onPress={() => {
            const p = lateFor!;
            setLateFor(null);
            setCapture({ ...p, lateReason: lateReason.trim() });
          }}
        />
      </Sheet>

      {/* Aksi per pekerja */}
      <Sheet
        visible={!!sheetFor}
        title={sheetFor ? t(sheetDay?.checkIn ? 'attendance.correctTitle' : 'attendance.actionTitle', { name: sheetFor.name }) : ''}
        onClose={() => setSheetFor(null)}
      >
        {sheetFor && selected && (
          <WorkerActions
            day={sheetDay}
            onCheckIn={(status) => {
              const w = sheetFor;
              setSheetFor(null);
              if (ABSENCE.includes(status)) {
                void saveWithoutPhoto((ctx) => checkIn(db, ctx, { workDate, gangId: selected.id, entries: [{ employeeId: w.id, attStatus: status }] }));
              } else proceed({ kind: 'checkInOne', employeeId: w.id, status });
            }}
            onCheckOut={() => {
              const w = sheetFor;
              setSheetFor(null);
              void saveWithoutPhoto((ctx) => checkOut(db, ctx, { workDate, gangId: sheetDay!.checkIn!.gangId, employeeIds: [w.id] }));
            }}
            onCorrect={(status) => {
              const original = sheetDay!.checkIn!;
              setSheetFor(null);
              if (ABSENCE.includes(status)) void saveWithoutPhoto((ctx) => correctCheckIn(db, ctx, original, status, null));
              else proceed({ kind: 'correct', original, status });
            }}
            defaultStatus={defaultStatus()}
          />
        )}
      </Sheet>

      {/* Pekerja dari gang lain */}
      <Sheet visible={otherOpen} title={t('attendance.addOther')} onClose={() => setOtherOpen(false)}>
        <TextField label={t('attendance.searchWorker')} value={query} onChangeText={setQuery} autoCorrect={false} />
        <Card>
          {filteredOthers.map((o, i) => (
            <ListRow
              key={o.e.id}
              icon="account"
              label={o.e.name}
              description={`${o.e.nik} · ${o.gangName}`}
              last={i === filteredOthers.length - 1}
              onPress={() => {
                setOtherOpen(false);
                setSheetFor(o.e);
              }}
            />
          ))}
        </Card>
      </Sheet>

      <CameraCapture
        visible={!!capture}
        title={capture?.kind === 'checkInAll' ? t('attendance.checkInAll', { count: capture.employeeIds.length }) : t('attendance.photoRequired')}
        onCaptured={(p) => void onCaptured(p)}
        onCancel={() => setCapture(null)}
      />
    </Screen>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Txt style={{ fontSize: 28, fontWeight: '800', color }}>{value}</Txt>
      <Txt variant="small" style={{ color: colors.textMuted, textAlign: 'center' }}>
        {label}
      </Txt>
    </View>
  );
}

function WorkerRow({
  worker,
  sub,
  status,
  last,
  onPress,
}: {
  worker: Employee;
  sub: string;
  status: { label: string; tone: PillTone };
  last: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${worker.name}, ${status.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.workerRow, !last && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Avatar name={worker.name} size={40} />
      <View style={{ flex: 1 }}>
        <Txt style={{ fontWeight: '600' }} numberOfLines={1}>
          {worker.name}
        </Txt>
        <Txt variant="small" style={{ color: colors.textMuted }} numberOfLines={1}>
          {sub}
        </Txt>
      </View>
      <StatusPill label={status.label} tone={status.tone} />
      <Icon name="chevron-right" size={28} color={colors.textMuted} />
    </Pressable>
  );
}

function WorkerActions({
  day,
  defaultStatus,
  onCheckIn,
  onCheckOut,
  onCorrect,
}: {
  day: DayAttendance | undefined;
  defaultStatus: AttStatus;
  onCheckIn: (s: AttStatus) => void;
  onCheckOut: () => void;
  onCorrect: (s: AttStatus) => void;
}) {
  const statuses: AttStatus[] = ['hadir', 'terlambat', 'sakit', 'izin', 'mangkir'];
  if (!day?.checkIn) {
    return (
      <>
        {statuses.map((s) => (
          <Button
            key={s}
            kind={s === defaultStatus ? 'primary' : 'outline'}
            icon={ABSENCE.includes(s) ? 'account-cancel' : 'camera-account'}
            label={t(`attendance.status.${s}`)}
            onPress={() => onCheckIn(s)}
          />
        ))}
      </>
    );
  }
  const current = day.checkIn.attStatus;
  return (
    <>
      {isPresent(day) && !day.checkOut && <Button icon="home-export-outline" label={t('attendance.checkOut')} onPress={onCheckOut} />}
      <SectionTitle>{t('attendance.correct')}</SectionTitle>
      {statuses
        .filter((s) => s !== current)
        .map((s) => (
          <Button key={s} kind="outline" label={t(`attendance.status.${s}`)} onPress={() => onCorrect(s)} />
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.successSoft },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  workerRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border },
});
