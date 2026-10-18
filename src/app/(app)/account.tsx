import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { countMaster } from '@/db/repositories/master';
import { MASTER_ENTITIES } from '@/db/schema';
import { SessionError } from '@/features/auth/session-service';
import { useSession } from '@/features/auth/session-store';
import { useSecurity } from '@/features/security/security-store';
import { useTrustedTime } from '@/features/security/useRiskWarnings';
import { t } from '@/i18n/id';
import { isCompromised } from '@/lib/guard';
import { useServices } from '@/lib/services';
import { colors, spacing, touch } from '@/theme';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Txt style={{ fontWeight: '700' }}>{label}</Txt>
      <Txt>{value}</Txt>
    </View>
  );
}

export default function AccountScreen() {
  const services = useServices();
  const user = useSession((s) => s.user);
  const integrity = useSecurity((s) => s.integrity);
  const fix = useSecurity((s) => s.lastFix);
  const locFail = useSecurity((s) => s.locationFailure);
  const time = useTrustedTime();
  const counts = useTableQuery(MASTER_ENTITIES, () => countMaster(services.db));
  const [checking, setChecking] = useState(false);

  const integrityText = !integrity
    ? '—'
    : isCompromised(integrity) || integrity.mockLocationEnabled
      ? Object.entries(integrity).filter(([, v]) => v).map(([k]) => k).join(', ')
      : t('account.integrityOk');

  const locationText = fix
    ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} ±${Math.round(fix.accuracyM ?? 0)} m${fix.mocked ? ' (PALSU)' : ''}`
    : locFail
      ? t(`location.${locFail}`)
      : t('account.locationNone');

  const logout = () =>
    Alert.alert(t('auth.logout'), t('auth.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.yes'),
        onPress: async () => {
          try {
            await services.session.logout();
            useSession.getState().signedOut();
          } catch (e) {
            Alert.alert(t('auth.logout'), e instanceof SessionError ? e.message : String(e));
          }
        },
      },
    ]);

  return (
    <Screen title={t('account.title')}>
      <View style={styles.card}>
        <Row label={t('account.user')} value={user ? `${user.name} (#${user.id})` : '—'} />
        <Row label={t('account.roles')} value={user?.roles.map((r) => t(`role.${r}`)).join(', ') ?? '—'} />
        <Row label={t('account.afdeling')} value={user?.afdeling_ids.join(', ') ?? '—'} />
        <Row label={t('account.deviceId')} value={services.device.deviceId} />
        <Row label={t('account.deviceShort')} value={services.device.deviceShort} />
        <Row label={t('account.appVersion')} value={services.device.appVersion} />
        <Row label={t('account.server')} value={services.getBaseUrl()} />
        <Row
          label={t('account.trustedTime')}
          value={`${new Date(time.ms).toLocaleString('id-ID')} · ${time.source === 'server' ? t('account.timeServer') : t('account.timeDevice')}`}
        />
        <Row label={t('account.integrity')} value={integrityText} />
        <Row label={t('account.location')} value={locationText} />
      </View>
      <Button
        kind="outline"
        label={t('account.checkLocation')}
        busy={checking}
        onPress={async () => {
          setChecking(true);
          await services.refreshLocation();
          setChecking(false);
        }}
      />

      <Txt variant="large" style={{ fontWeight: '700' }}>
        {t('home.masterTitle')}
      </Txt>
      <View style={styles.card}>
        {MASTER_ENTITIES.map((e) => (
          <Row key={e} label={t(`entity.${e}`)} value={String(counts[e])} />
        ))}
      </View>

      <Button kind="danger" label={t('auth.logout')} onPress={logout} />
      <Button kind="outline" label={t('common.back')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: touch.radius },
  row: {
    minHeight: touch.minSize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'center',
  },
});
