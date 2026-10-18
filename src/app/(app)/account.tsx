import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
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

export default function AccountScreen() {
  const services = useServices();
  const user = useSession((s) => s.user);
  const integrity = useSecurity((s) => s.integrity);
  const fix = useSecurity((s) => s.lastFix);
  const locFail = useSecurity((s) => s.locationFailure);
  const time = useTrustedTime();
  const counts = useTableQuery(MASTER_ENTITIES, () => countMaster(services.db));
  const [checking, setChecking] = useState(false);

  const compromised = !!integrity && (isCompromised(integrity) || integrity.mockLocationEnabled);
  const integrityText = !integrity
    ? '—'
    : compromised
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
    <Screen title={t('account.title')} back>
      <SectionTitle>{t('account.user')}</SectionTitle>
      <Card>
        <ListRow icon="account" label={user?.name ?? '—'} description={`#${user?.id ?? ''}`} />
        <ListRow icon="badge-account" tone="accent" label={t('account.roles')} description={user?.roles.map((r) => t(`role.${r}`)).join(', ')} />
        <ListRow icon="map-marker-radius" label={t('account.afdeling')} value={user?.afdeling_ids.join(', ') ?? '—'} last />
      </Card>

      <SectionTitle>{t('account.device')}</SectionTitle>
      <Card>
        <ListRow icon="cellphone" label={t('account.deviceId')} description={services.device.deviceId} />
        <ListRow icon="identifier" tone="accent" label={t('account.deviceShort')} value={services.device.deviceShort} />
        <ListRow icon="information-outline" label={t('account.appVersion')} value={services.device.appVersion} />
        <ListRow icon="server-network" tone="accent" label={t('account.server')} description={services.getBaseUrl()} />
        <ListRow
          icon="clock-check-outline"
          tone={time.source === 'server' ? 'success' : 'danger'}
          label={t('account.trustedTime')}
          description={`${new Date(time.ms).toLocaleString('id-ID')} · ${time.source === 'server' ? t('account.timeServer') : t('account.timeDevice')}`}
        />
        <ListRow
          icon={compromised ? 'shield-alert' : 'shield-check'}
          tone={compromised ? 'danger' : 'success'}
          label={t('account.integrity')}
          description={integrityText}
        />
        <ListRow
          icon="crosshairs-gps"
          tone={fix?.mocked ? 'danger' : 'primary'}
          label={t('account.location')}
          description={locationText}
          last
        />
      </Card>
      <Button
        kind="outline"
        icon="crosshairs-gps"
        label={t('account.checkLocation')}
        busy={checking}
        onPress={async () => {
          setChecking(true);
          await services.refreshLocation();
          setChecking(false);
        }}
      />

      <Card>
        <ListRow icon="printer" label={t('account.printer')} last onPress={() => router.push('/printer')} />
      </Card>

      <SectionTitle>{t('home.masterTitle')}</SectionTitle>
      <Card>
        {MASTER_ENTITIES.map((e, i) => (
          <ListRow key={e} label={t(`entity.${e}`)} value={String(counts[e])} last={i === MASTER_ENTITIES.length - 1} />
        ))}
      </Card>

      <Button kind="danger" icon="logout" label={t('auth.logout')} onPress={logout} />
    </Screen>
  );
}
