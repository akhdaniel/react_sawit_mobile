// Harus dimuat di scope global agar TaskManager.defineTask terdaftar sebelum task dijalankan.
import '@/sync/background-task';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CenterMessage } from '@/components/CenterMessage';
import { DatabaseProvider } from '@/db/provider';
import { useSession } from '@/features/auth/session-store';
import { t } from '@/i18n/id';
import { ServicesProvider } from '@/lib/services';

function RootStack() {
  const status = useSession((s) => s.status);
  if (status === 'booting') return <CenterMessage busy text={t('common.loading')} />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'unlocked'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsPin'}>
        <Stack.Screen name="pin-setup" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="unlock" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DatabaseProvider
        renderState={(state, retry) =>
          state.status === 'opening' ? (
            <CenterMessage busy text={t('boot.openingDb')} />
          ) : (
            <CenterMessage text={`${t('boot.dbError')}\n${state.error.message}`}>
              <Button label={t('common.retry')} onPress={retry} />
            </CenterMessage>
          )
        }
      >
        <ServicesProvider>
          <RootStack />
        </ServicesProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
