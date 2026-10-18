import { useNetInfo } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { getMeta, META_KEYS } from '@/db/repositories/meta';
import { listRejected } from '@/db/repositories/outbox';
import { getPendingSummary, PENDING_WATCH_TABLES } from '@/db/repositories/pending';
import { TRANSACTION_TYPES } from '@/db/schema';
import { SessionError } from '@/features/auth/session-service';
import { ServerSheet } from '@/features/server/ServerSheet';
import { needsReauth, useSync } from '@/features/sync/sync-store';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, radius, spacing } from '@/theme';

const TYPE_LABEL: Record<string, string> = {
  attendance: t('menu.attendance'),
  assignment: t('menu.assignment'),
  harvest_ticket: t('menu.harvest'),
  spb: t('menu.transport'),
  upkeep: t('menu.upkeep'),
  material_usage: t('sync.material'),
  daily_report: t('menu.dailyReport'),
  approval_decision: t('menu.approval'),
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID') : t('sync.never'));

export default function SyncScreen() {
  const services = useServices();
  const net = useNetInfo();
  const { running, step, lastResult } = useSync();
  const pending = useTableQuery(PENDING_WATCH_TABLES, () => getPendingSummary(services.db));
  const rejected = useTableQuery(PENDING_WATCH_TABLES, () => listRejected(services.db));
  const lastSyncAt = useTableQuery(['app_meta'], () => getMeta(services.db, META_KEYS.lastSyncAt));
  const [password, setPassword] = useState('');
  const [loginName, setLoginName] = useState('');
  const [knownLogin, setKnownLogin] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void services.session.loginName().then(setKnownLogin);
  }, [services]);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);

  const online = net.isConnected !== false;
  const reauth = needsReauth(lastResult);

  const reauthenticate = async () => {
    setReauthBusy(true);
    setReauthError(null);
    try {
      await services.session.reauthenticate(password, knownLogin ? undefined : loginName);
      setKnownLogin(knownLogin ?? loginName.trim());
      setPassword('');
      await services.sync();
    } catch (e) {
      setReauthError(e instanceof SessionError || e instanceof Error ? e.message : String(e));
    } finally {
      setReauthBusy(false);
    }
  };

  return (
    <Screen title={t('sync.title')} back>
      <Card padded>
        <View style={[styles.status, { backgroundColor: online ? colors.successSoft : colors.warningSoft }]}>
          <Icon name={online ? 'wifi' : 'wifi-off'} size={26} color={online ? colors.success : colors.text} />
          <Txt style={{ flex: 1, fontWeight: '700' }}>{online ? t('sync.online', { type: net.type }) : t('sync.offline')}</Txt>
        </View>
        <Button
          icon="sync"
          label={running ? (step ? t(`sync.step.${step}`) : t('sync.running')) : t('sync.now')}
          busy={running}
          onPress={() => void services.sync().catch(() => undefined)}
        />
        <Txt style={{ textAlign: 'center', color: colors.textMuted }}>
          {t('sync.lastSync')}: <Txt style={{ fontWeight: '700' }}>{fmt(lastSyncAt)}</Txt>
        </Txt>
      </Card>

      {reauth && (
        <Card padded>
          <Txt variant="large" style={{ fontWeight: '700' }}>
            {t('sync.reauthTitle')}
          </Txt>
          <Txt>{t('sync.reauthHint')}</Txt>
          {knownLogin === null && (
            <TextField label={t('auth.login')} value={loginName} onChangeText={setLoginName} autoCapitalize="none" autoCorrect={false} />
          )}
          <TextField label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry error={reauthError ?? undefined} />
          <Button
            icon="login"
            label={t('sync.reauthSubmit')}
            busy={reauthBusy}
            disabled={!password || (knownLogin === null && !loginName.trim())}
            onPress={() => void reauthenticate()}
          />
        </Card>
      )}

      <SectionTitle>{t('sync.pendingTitle')}</SectionTitle>
      <Card>
        {TRANSACTION_TYPES.filter((ty) => pending.byType[ty] > 0).map((ty) => (
          <ListRow key={ty} icon="tray-arrow-up" tone="accent" label={TYPE_LABEL[ty] ?? ty} value={String(pending.byType[ty])} />
        ))}
        <ListRow icon="database-clock" label={t('sync.totalPending')} value={String(pending.total)} />
        <ListRow icon="image-multiple" tone="accent" label={t('sync.photosPending')} value={String(pending.photos)} last />
      </Card>

      {lastResult && (
        <>
          <SectionTitle>{`${t('sync.resultTitle')} · ${lastResult.ok ? t('sync.resultOk') : t('sync.resultPartial')}`}</SectionTitle>
          <Card>
            <ListRow icon="send" label={t('sync.sent')} value={String(lastResult.push.sent)} />
            <ListRow icon="check-circle" tone="success" label={t('sync.accepted')} value={String(lastResult.push.accepted + lastResult.push.duplicate)} />
            <ListRow icon="close-circle" tone="danger" label={t('sync.rejected')} value={String(lastResult.push.rejected + lastResult.status.rejected)} />
            <ListRow icon="book-check" tone="success" label={t('sync.posted')} value={String(lastResult.status.posted)} />
            <ListRow icon="image-check" tone="accent" label={t('sync.photosUploaded')} value={String(lastResult.photos.uploaded)} />
            <ListRow icon="database-sync" label={t('sync.masterUpdated')} value={String(lastResult.master.upserted + lastResult.master.deleted)} last />
          </Card>
          {lastResult.errors.map((e, i) => (
            <View key={i} style={styles.error}>
              <Icon name="alert-circle" size={24} color={colors.onDanger} />
              <Txt style={{ flex: 1, color: colors.onDanger, fontWeight: '700' }}>
                {t(`sync.step.${e.step}`)}: {t(`sync.errorKind.${e.kind}`)} — {e.message}
              </Txt>
            </View>
          ))}
          {lastResult.errors.some((e) => e.kind === 'offline') && (
            <Button kind="outline" icon="server-network" label={t('server.title')} onPress={() => setServerOpen(true)} />
          )}
          {lastResult.push.invalid.length > 0 && (
            <>
              <SectionTitle>{t('sync.invalidTitle')}</SectionTitle>
              <Card>
                {lastResult.push.invalid.map((x, i) => (
                  <ListRow
                    key={x.mobileUuid}
                    icon="alert"
                    tone="danger"
                    label={`${TYPE_LABEL[x.type] ?? x.type} ${x.mobileUuid.slice(0, 8)}`}
                    description={x.error}
                    last={i === lastResult.push.invalid.length - 1}
                  />
                ))}
              </Card>
            </>
          )}
        </>
      )}

      <SectionTitle>{t('sync.rejectedTitle')}</SectionTitle>
      {rejected.length === 0 ? (
        <Card padded>
          <Txt>{t('sync.noRejected')}</Txt>
        </Card>
      ) : (
        <>
          <Txt>{t('sync.rejectedHint')}</Txt>
          <Card>
            {rejected.map((r, i) => (
              <ListRow
                key={r.mobileUuid}
                icon="close-octagon"
                tone="danger"
                label={`${TYPE_LABEL[r.type] ?? r.type} · ${fmt(r.createdTrustedAt)}`}
                description={r.reason}
                last={i === rejected.length - 1}
              />
            ))}
          </Card>
        </>
      )}
      {serverOpen && <ServerSheet visible onClose={() => setServerOpen(false)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.danger },
});
