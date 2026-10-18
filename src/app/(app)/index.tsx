import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useSession } from '@/features/auth/session-store';
import { menuForRoles } from '@/features/menu/menu';
import { t } from '@/i18n/id';
import { spacing } from '@/theme';

export default function HomeScreen() {
  const user = useSession((s) => s.user);
  const items = user ? menuForRoles(user.roles) : [];

  return (
    <Screen
      title={t('home.title')}
      subtitle={user ? `${t('home.greeting', { name: user.name })} · ${user.roles.map((r) => t(`role.${r}`)).join(', ')}` : undefined}
    >
      {items.length === 0 && <Txt>{t('home.noMenu')}</Txt>}
      <View style={styles.grid}>
        {items.map((m) => (
          <View key={m.key} style={styles.cell}>
            <Button
              label={t(m.label)}
              onPress={() =>
                m.key === 'sync' ? router.push('/sync') : router.push({ pathname: '/module/[key]', params: { key: m.key } })
              }
            />
          </View>
        ))}
      </View>
      <Button kind="outline" label={t('home.account')} onPress={() => router.push('/account')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { flexBasis: '47%', flexGrow: 1 },
});
