import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { countMaster } from '@/db/repositories/master';
import { useDb, useTableQuery } from '@/db/provider';
import { MASTER_ENTITIES } from '@/db/schema';
import { t } from '@/i18n/id';
import { colors, spacing, touch } from '@/theme';

export default function HomeScreen() {
  const db = useDb();
  const counts = useTableQuery(MASTER_ENTITIES, () => countMaster(db));
  const empty = Object.values(counts).every((n) => n === 0);

  return (
    <Screen title={t('home.title')}>
      <Txt variant="large" style={{ fontWeight: '700' }}>
        {t('home.masterTitle')}
      </Txt>
      {empty && <Txt>{t('home.masterEmpty')}</Txt>}
      <View style={styles.list}>
        {MASTER_ENTITIES.map((entity) => (
          <View key={entity} style={styles.row}>
            <Txt>{t(`entity.${entity}`)}</Txt>
            <Txt style={{ fontWeight: '700' }}>{counts[entity]}</Txt>
          </View>
        ))}
      </View>
      <Txt style={{ color: colors.textMuted }}>{t('home.stageNote')}</Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 2, borderColor: colors.border, borderRadius: touch.radius },
  row: {
    minHeight: touch.minSize,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
