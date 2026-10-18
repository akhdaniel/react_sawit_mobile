import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CenterMessage } from '@/components/CenterMessage';
import { DatabaseProvider } from '@/db/provider';
import { t } from '@/i18n/id';

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
        <Stack screenOptions={{ headerShown: false }} />
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
