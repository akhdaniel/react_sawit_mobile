import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card, SectionTitle } from '@/components/Card';
import type { IconName } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { getPendingSummary, PENDING_WATCH_TABLES } from '@/db/repositories/pending';
import { useTableQuery } from '@/db/provider';
import { useSession } from '@/features/auth/session-store';
import { menuForRoles } from '@/features/menu/menu';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export default function HomeScreen() {
  const { db } = useServices();
  const user = useSession((s) => s.user);
  const items = user ? menuForRoles(user.roles) : [];
  const pending = useTableQuery(PENDING_WATCH_TABLES, () => getPendingSummary(db).total);

  const hero = user && (
    <View style={styles.profile}>
      <Avatar name={user.name} />
      <View style={{ flex: 1 }}>
        <Txt variant="large" style={styles.name} numberOfLines={1}>
          {user.name}
        </Txt>
        <Txt style={styles.role} numberOfLines={2}>
          {user.roles.map((r) => t(`role.${r}`)).join(', ')}
        </Txt>
      </View>
    </View>
  );

  return (
    <Screen title={t('app.name')} hero={hero}>
      <SectionTitle>{t('home.menu')}</SectionTitle>
      {items.length === 0 && <Txt>{t('home.noMenu')}</Txt>}
      <Card>
        {items.map((m, i) => (
          <ListRow
            key={m.key}
            icon={m.icon as IconName}
            tone={i % 2 === 0 ? 'primary' : 'accent'}
            label={t(m.label)}
            badge={m.key === 'sync' && pending > 0 ? String(pending) : undefined}
            last={i === items.length - 1}
            onPress={() => (m.route ? router.push(m.route) : router.push({ pathname: '/module/[key]', params: { key: m.key } }))}
          />
        ))}
      </Card>
      <SectionTitle>{t('home.other')}</SectionTitle>
      <Card>
        <ListRow icon="account-cog" tone="primary" label={t('home.account')} last onPress={() => router.push('/account')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  name: { color: colors.onPrimary, fontWeight: '800' },
  role: { color: colors.onPrimary },
});
