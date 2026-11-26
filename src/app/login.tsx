import { useState } from 'react';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { LoginForm } from '@/features/auth/LoginForm';
import { SessionError } from '@/features/auth/session-service';
import { useSession } from '@/features/auth/session-store';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';

export default function LoginScreen() {
  const services = useServices();
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen title={t('app.name')} subtitle={t('auth.loginTitle')}>
      <Card padded>
        <Txt>{t('auth.loginHint')}</Txt>
        <LoginForm
        defaultBaseUrl={services.getBaseUrl()}
        error={error}
        onSubmit={async (v) => {
          setError(null);
          const previousUrl = services.getBaseUrl();
          try {
            services.setBaseUrl(v.baseUrl);
            const s = await services.session.login(v.login, v.password);
            useSession.getState().signedIn(s.user, s.hasPin);
          } catch (e) {
            // Data belum terkirim milik server lama: alamat lama dipakai lagi agar bisa disinkronkan.
            if (e instanceof SessionError && e.code === 'pending_other_server') services.setBaseUrl(previousUrl);
            setError(e instanceof SessionError || e instanceof Error ? e.message : String(e));
          }
        }}
        />
      </Card>
    </Screen>
  );
}
