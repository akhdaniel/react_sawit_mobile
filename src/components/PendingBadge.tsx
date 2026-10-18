import { StyleSheet, View } from 'react-native';

import { getPendingSummary, PENDING_WATCH_TABLES } from '@/db/repositories/pending';
import { useDb, useTableQuery } from '@/db/provider';
import { t } from '@/i18n/id';
import { colors, spacing, touch } from '@/theme';

import { Txt } from './Txt';

/** Indikator "X data belum terkirim" — selalu tampil di header. */
export function PendingBadge() {
  const db = useDb();
  const { total } = useTableQuery(PENDING_WATCH_TABLES, () => getPendingSummary(db));
  const has = total > 0;
  return (
    <View
      accessibilityRole="text"
      style={[styles.badge, { backgroundColor: has ? colors.warning : colors.primary }]}
    >
      <Txt style={{ color: has ? colors.onWarning : colors.onPrimary, fontWeight: '700' }}>
        {has ? t('header.pendingSome', { count: total }) : t('header.pendingNone')}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: touch.minSize,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
