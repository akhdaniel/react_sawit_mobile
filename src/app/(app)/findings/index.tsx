/**
 * Temuan terbuka di afdeling pengguna (master ERP + temuan HP yang belum diterima server), kritis dulu lalu jatuh
 * tempo. Ketuk → rincian + "Tindak Lanjut" (tindakan, selesai Ya/Tidak, foto) yang terkirim saat sinkron.
 * Tindak lanjut hanya mandor panen/rawat, asisten, inspektur; kerani melihat saja.
 */
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { StatusPill } from '@/components/StatusPill';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { findingFollowups, FOLLOWUP_ROLES, listOpenFindings, type OpenFindingView } from '@/db/repositories/inspection';
import { useSession } from '@/features/auth/session-store';
import { CameraCapture, type CapturedPhoto } from '@/features/camera/CameraCapture';
import { saveFollowup } from '@/features/inspection/actions';
import { useRefresh } from '@/features/sync/useRefresh';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

const SEVERITY_TONE = { critical: 'danger', major: 'warning', minor: 'neutral' } as const;

export default function FindingsScreen() {
  const refresh = useRefresh();
  const services = useServices();
  const { db, clock } = services;
  const today = clock.workDate();
  const user = useSession((s) => s.user);
  const roles = user?.roles ?? [];
  const canFollowUp = FOLLOWUP_ROLES.some((r) => roles.includes(r));
  const rows = useTableQuery(['open_finding', 'inspection', 'inspection_finding', 'inspection_followup', 'block'], () =>
    listOpenFindings(db, user?.afdeling_ids ?? []),
  );

  const [open, setOpen] = useState<OpenFindingView | null>(null);
  const [action, setAction] = useState('');
  const [done, setDone] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Pratinjau foto riwayat: daftar foto satu tindak lanjut dan foto yang diketuk. */
  const [preview, setPreview] = useState<{ uris: string[]; index: number } | null>(null);
  const history = useTableQuery(['inspection_followup', 'photo', open?.ref ?? '-'], () => (open ? findingFollowups(db, open) : []));

  const show = (f: OpenFindingView) => {
    setOpen(f);
    setAction('');
    setDone(false);
    setPhotos([]);
  };

  const save = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const ctx = await services.txContext();
      const r = saveFollowup(db, ctx, { findingRef: open.ref, actionText: action, done, photoIds: photos.map((p) => p.id) }, roles, photos);
      if (!r.ok) {
        Alert.alert(t('findings.title'), r.issues.map((i) => `• ${t(`findings.error.${i}`)}`).join('\n'));
        return;
      }
      setOpen(null);
      Alert.alert(t('findings.title'), t('findings.saved'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refresh={refresh} title={t('findings.title')} back>
      <Txt variant="small" style={{ color: colors.textMuted }}>{t('findings.hint')}</Txt>
      <SectionTitle>{t('findings.count', { count: rows.length })}</SectionTitle>
      {rows.length === 0 ? (
        <Card padded>
          <Txt>{t('findings.none')}</Txt>
        </Card>
      ) : (
        <Card>
          {rows.map((f, i) => {
            const overdue = !!f.dueDate && f.dueDate < today;
            return (
              <Pressable
                key={f.ref}
                accessibilityRole="button"
                onPress={() => show(f)}
                style={({ pressed }) => [styles.row, i < rows.length - 1 && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
              >
                <View style={[styles.icon, f.severity === 'critical' && { backgroundColor: colors.dangerSoft }]}>
                  <Icon name="alert-circle" size={24} color={f.severity === 'critical' ? colors.danger : colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt style={{ fontWeight: '700' }}>
                    {t(`finding.categories.${f.category as 'lainnya'}`)} · {t('inspection.block')} {f.blockCode}
                  </Txt>
                  <Txt variant="small" numberOfLines={2} style={{ color: colors.textMuted }}>
                    {f.description}
                  </Txt>
                  <View style={styles.pills}>
                    <StatusPill label={t(`finding.severities.${f.severity}`)} tone={SEVERITY_TONE[f.severity]} />
                    <StatusPill label={t(`findings.states.${f.state}`)} tone={f.state === 'pending' ? 'warning' : 'primary'} />
                    {f.dueDate && <StatusPill label={overdue ? t('findings.overdue') : t('finding.due', { date: f.dueDate })} tone={overdue ? 'danger' : 'neutral'} />}
                    {f.lastFollowup && (
                      <StatusPill
                        label={t('findings.lastFollowup', {
                          state: t(f.lastFollowup.done ? 'findings.doneYes' : 'findings.doneNo'),
                          status: t(`status.${f.lastFollowup.status}`),
                        })}
                        tone="success"
                      />
                    )}
                  </View>
                </View>
                <Icon name="chevron-right" size={24} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </Card>
      )}

      <Sheet visible={!!open && !camera && !preview} title={open ? t(`finding.categories.${open.category as 'lainnya'}`) : ''} onClose={() => setOpen(null)}>
        {open && (
          <>
            <View style={styles.pills}>
              <StatusPill label={t(`finding.severities.${open.severity}`)} tone={SEVERITY_TONE[open.severity]} />
              <StatusPill label={t(`findings.states.${open.state}`)} tone={open.state === 'pending' ? 'warning' : 'primary'} />
              {open.dueDate && <StatusPill label={t('finding.due', { date: open.dueDate })} tone="neutral" />}
            </View>
            <Txt>{open.description}</Txt>
            <Txt variant="small" style={{ color: colors.textMuted }}>
              {t('inspection.block')} {open.blockCode}
              {open.rowNo || open.treeNo ? ` · ${t('finding.location', { row: open.rowNo ?? '—', tree: open.treeNo ?? '—' })}` : ''}
            </Txt>
            {history.length > 0 && (
              <>
                <SectionTitle>{t('findings.history', { count: history.length })}</SectionTitle>
                {history.map((h) => (
                  <Card key={h.mobileUuid} padded>
                    <View style={styles.pills}>
                      <StatusPill label={t(h.done ? 'findings.doneYes' : 'findings.doneNo')} tone={h.done ? 'success' : 'warning'} />
                      <StatusPill label={t(`status.${h.status}`)} tone={h.status === 'rejected' ? 'danger' : 'neutral'} />
                      <StatusPill label={new Date(h.createdTrustedAt).toLocaleString('id-ID')} tone="neutral" />
                    </View>
                    <Txt>{h.actionText}</Txt>
                    {h.status === 'rejected' && h.rejectReason && (
                      <Txt variant="small" style={{ color: colors.danger }}>
                        {h.rejectReason}
                      </Txt>
                    )}
                    {h.photoUris.length > 0 && (
                      <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
                        {h.photoUris.map((uri, i) => (
                          <Pressable key={uri} accessibilityRole="imagebutton" onPress={() => setPreview({ uris: h.photoUris, index: i })}>
                            <Image source={{ uri }} style={styles.img} accessibilityLabel={t('findings.photo')} />
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </Card>
                ))}
              </>
            )}
            {canFollowUp ? (
              <>
                <SectionTitle>{t('findings.followup')}</SectionTitle>
                <TextField label={t('findings.action')} value={action} onChangeText={setAction} multiline />
                <Txt style={{ fontWeight: '700' }}>{t('findings.doneQuestion')}</Txt>
                <View style={styles.pills}>
                  <Chip label={t('findings.doneYes')} selected={done} onPress={() => setDone(true)} />
                  <Chip label={t('findings.doneNo')} selected={!done} onPress={() => setDone(false)} />
                </View>
                {photos.length > 0 && (
                  <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
                    {photos.map((p, i) => (
                      <Pressable
                        key={p.id}
                        accessibilityRole="imagebutton"
                        onPress={() => setPreview({ uris: photos.map((x) => x.localUri), index: i })}
                      >
                        <Image source={{ uri: p.localUri }} style={styles.img} accessibilityLabel={t('findings.photo')} />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                <Button kind="outline" icon="camera" label={t('inspection.addPhoto')} onPress={() => setCamera(true)} />
                <Button icon="content-save" label={t('findings.save')} busy={busy} disabled={!action.trim()} onPress={() => void save()} />
              </>
            ) : (
              <Card padded>
                <Txt>{t('findings.viewOnly')}</Txt>
              </Card>
            )}
          </>
        )}
      </Sheet>
      <PhotoViewer uris={preview?.uris ?? []} index={preview?.index ?? null} onClose={() => setPreview(null)} />
      <CameraCapture
        visible={camera}
        title={t('findings.photo')}
        onCaptured={(p) => {
          setPhotos((ps) => [...ps, p]);
          setCamera(false);
        }}
        onCancel={() => setCamera(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, alignItems: 'center' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  img: { width: 120, height: 90, borderRadius: radius.md },
});
