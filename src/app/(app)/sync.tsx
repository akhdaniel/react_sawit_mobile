import { useNetInfo } from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { getMeta, META_KEYS } from '@/db/repositories/meta';
import { listRejected } from '@/db/repositories/outbox';
import { getPendingSummary, PENDING_WATCH_TABLES } from '@/db/repositories/pending';
import { TRANSACTION_TYPES } from '@/db/schema';
import { SessionError } from '@/features/auth/session-service';
import { needsReauth, useSync } from '@/features/sync/sync-store';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing, touch } from '@/theme';

const TYPE_LABEL: Record<string, string> = {
  attendance: t('menu.attendance'),
  assignment: t('menu.assignment'),
  harvest_ticket: t('menu.harvest'),
  spb: t('menu.transport'),
  upkeep: t('menu.upkeep'),
  material_usage: 'Material',
  daily_report: t('menu.dailyReport'),
  approval_decision: t('menu.approval'),
};

function Row({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <Txt style={{ fontWeight: strong ? '700' : '400' }}>{value}</Txt>
    </View>
  );
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID') : t('sync.never'));

export default function SyncScreen() {
  const services = useServices();
  const net = useNetInfo();
  const { running, step, lastResult } = useSync();
  const pending = useTableQuery(PENDING_WATCH_TABLES, () => getPendingSummary(services.db));
  const rejected = useTableQuery(PENDING_WATCH_TABLES, () => listRejected(services.db));
  const lastSyncAt = useTableQuery(['app_meta'], () => getMeta(services.db, META_KEYS.lastSyncAt));
  const [password, setPassword] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthBusy, setReauthBusy] = useState(false);

  const online = net.isConnected !== false;
  const reauth = needsReauth(lastResult);

  const reauthenticate = async () => {
    setReauthBusy(true);
    setReauthError(null);
    try {
      await services.session.reauthenticate(password);
      setPassword('');
      await services.sync();
    } catch (e) {
      setReauthError(e instanceof SessionError || e instanceof Error ? e.message : String(e));
    } finally {
      setReauthBusy(false);
    }
  };

  return (
    <Screen title={t('sync.title')}>
      <View style={[styles.banner, { backgroundColor: online ? colors.primary : colors.warning }]}>
        <Txt style={{ color: online ? colors.onPrimary : colors.onWarning, fontWeight: '700' }}>
          {online ? t('sync.online', { type: net.type }) : t('sync.offline')}
        </Txt>
      </View>

      <Button
        label={running ? (step ? t(`sync.step.${step}`) : t('sync.running')) : t('sync.now')}
        busy={running}
        onPress={() => void services.sync().catch(() => undefined)}
      />
      <Row label={t('sync.lastSync')} value={fmt(lastSyncAt)} strong />

      {reauth && (
        <View style={styles.card}>
          <View style={styles.cardBody}>
            <Txt variant="large" style={{ fontWeight: '700' }}>
              {t('sync.reauthTitle')}
            </Txt>
            <Txt>{t('sync.reauthHint')}</Txt>
            <TextField label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry error={reauthError ?? undefined} />
            <Button label={t('sync.reauthSubmit')} busy={reauthBusy} disabled={!password} onPress={() => void reauthenticate()} />
          </View>
        </View>
      )}

      <Txt variant="large" style={{ fontWeight: '700' }}>
        {t('sync.pendingTitle')}
      </Txt>
      <View style={styles.card}>
        {TRANSACTION_TYPES.filter((ty) => pending.byType[ty] > 0).map((ty) => (
          <Row key={ty} label={TYPE_LABEL[ty] ?? ty} value={pending.byType[ty]} />
        ))}
        <Row label={t('header.pendingSome', { count: '' }).trim()} value={pending.total} strong />
        <Row label={t('sync.photosPending')} value={pending.photos} />
      </View>

      {lastResult && (
        <>
          <Txt variant="large" style={{ fontWeight: '700' }}>
            {t('sync.resultTitle')} · {lastResult.ok ? t('sync.resultOk') : t('sync.resultPartial')}
          </Txt>
          <View style={styles.card}>
            <Row label={t('sync.sent')} value={lastResult.push.sent} />
            <Row label={t('sync.accepted')} value={lastResult.push.accepted + lastResult.push.duplicate} />
            <Row label={t('sync.rejected')} value={lastResult.push.rejected + lastResult.status.rejected} />
            <Row label={t('sync.posted')} value={lastResult.status.posted} />
            <Row label={t('sync.photosUploaded')} value={lastResult.photos.uploaded} />
            <Row label={t('sync.masterUpdated')} value={lastResult.master.upserted + lastResult.master.deleted} />
            {lastResult.errors.map((e, i) => (
              <View key={i} style={[styles.row, { backgroundColor: colors.danger }]}>
                <Txt style={{ color: colors.onDanger, fontWeight: '700' }}>
                  {t(`sync.step.${e.step}`)}: {t(`sync.errorKind.${e.kind}`)} — {e.message}
                </Txt>
              </View>
            ))}
          </View>
          {lastResult.push.invalid.length > 0 && (
            <>
              <Txt style={{ fontWeight: '700', color: colors.danger }}>{t('sync.invalidTitle')}</Txt>
              <View style={styles.card}>
                {lastResult.push.invalid.map((x) => (
                  <Row key={x.mobileUuid} label={`${TYPE_LABEL[x.type] ?? x.type} ${x.mobileUuid.slice(0, 8)}`} value={x.error} />
                ))}
              </View>
            </>
          )}
        </>
      )}

      <Txt variant="large" style={{ fontWeight: '700' }}>
        {t('sync.rejectedTitle')}
      </Txt>
      {rejected.length === 0 ? (
        <Txt>{t('sync.noRejected')}</Txt>
      ) : (
        <>
          <Txt>{t('sync.rejectedHint')}</Txt>
          <View style={styles.card}>
            {rejected.map((r) => (
              <View key={r.mobileUuid} style={styles.row}>
                <Txt style={{ fontWeight: '700' }}>
                  {TYPE_LABEL[r.type] ?? r.type} · {fmt(r.createdTrustedAt)}
                </Txt>
                <Txt style={{ color: colors.danger }}>{r.reason}</Txt>
              </View>
            ))}
          </View>
        </>
      )}

      <Button kind="outline" label={t('common.back')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { padding: spacing.md, borderRadius: touch.radius },
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: touch.radius },
  cardBody: { padding: spacing.md, gap: spacing.md },
  row: {
    minHeight: touch.minSize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
