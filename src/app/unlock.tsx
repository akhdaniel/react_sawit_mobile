import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/Button';
import { PinPad } from '@/components/PinPad';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { PIN_MAX, PIN_MIN } from '@/features/auth/session-service';
import { useSession } from '@/features/auth/session-store';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors } from '@/theme';

export default function UnlockScreen() {
  const services = useServices();
  const user = useSession((s) => s.user);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    void services.session.pinLockedUntil().then(setLockedUntil);
  }, [services]);

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const remainingSec = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - services.clock.now().ms) / 1000)) : 0;
  const locked = remainingSec > 0;

  const submit = async (pin: string) => {
    const r = await services.session.verifyPin(pin);
    if (r.ok) {
      setMessage(null);
      useSession.getState().unlocked();
      void services.refreshLocation();
      return;
    }
    if (r.reason === 'wiped') {
      Alert.alert(t('auth.pinWiped'));
      useSession.getState().signedOut();
    } else if (r.reason === 'locked') {
      setLockedUntil(r.lockedUntil);
    } else {
      setLockedUntil(r.lockedUntil);
      setMessage(t('auth.pinWrong', { count: r.remainingBeforeWipe }));
    }
  };

  const forgot = () =>
    Alert.alert(t('auth.forgotPin'), t('auth.forgotPinConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.yes'),
        onPress: () => void services.session.resetForRelogin().then(() => useSession.getState().signedOut()),
      },
    ]);

  return (
    <Screen title={t('auth.unlockTitle')} subtitle={user ? t('auth.unlockHint', { name: user.name }) : undefined}>
      {locked && <Txt style={{ color: colors.danger, fontWeight: '700' }}>{t('auth.pinLocked', { seconds: remainingSec })}</Txt>}
      {!locked && !!message && <Txt style={{ color: colors.danger, fontWeight: '700' }}>{message}</Txt>}
      <PinPad minLength={PIN_MIN} maxLength={PIN_MAX} onSubmit={submit} disabled={locked} />
      <Button kind="outline" label={t('auth.forgotPin')} onPress={forgot} />
    </Screen>
  );
}
