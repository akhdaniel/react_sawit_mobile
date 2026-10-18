import { useState } from 'react';

import { PinPad } from '@/components/PinPad';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { PIN_MAX, PIN_MIN } from '@/features/auth/session-service';
import { useSession } from '@/features/auth/session-store';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors } from '@/theme';

export default function PinSetupScreen() {
  const { session } = useServices();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (pin: string) => {
    if (first == null) {
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError(t('auth.pinMismatch'));
      return;
    }
    setBusy(true);
    try {
      await session.setPin(pin);
      useSession.getState().pinSet();
    } catch (e) {
      setFirst(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={first == null ? t('auth.pinSetupTitle') : t('auth.pinConfirmTitle')}>
      <Txt>{t('auth.pinSetupHint', { min: PIN_MIN, max: PIN_MAX })}</Txt>
      {!!error && <Txt style={{ color: colors.danger, fontWeight: '700' }}>{error}</Txt>}
      <PinPad key={first ?? 'first'} minLength={PIN_MIN} maxLength={PIN_MAX} onSubmit={submit} disabled={busy} />
    </Screen>
  );
}
