import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { getPendingSummary, PENDING_WATCH_TABLES } from '@/db/repositories/pending';
import { useDb, useTableQuery } from '@/db/provider';
import { useSession } from '@/features/auth/session-store';
import { useSync } from '@/features/sync/sync-store';
import { t } from '@/i18n/id';
import { colors, spacing, touch } from '@/theme';

import { Txt } from './Txt';

/** Indikator "X data belum terkirim" — selalu tampil di header; ketuk untuk ke layar Sinkron. */
export function PendingBadge() {
  const db = useDb();
  const { total } = useTableQuery(PENDING_WATCH_TABLES, () => getPendingSummary(db));
  const unlocked = useSession((s) => s.status === 'unlocked');
  const running = useSync((s) => s.running);
  const has = total > 0;
  return (
    <Pressable
      accessibilityRole={unlocked ? 'button' : 'text'}
      disabled={!unlocked}
      onPress={() => router.push('/sync')}
      style={[styles.badge, { backgroundColor: has ? colors.warning : colors.primary }]}
    >
      <Txt style={{ color: has ? colors.onWarning : colors.onPrimary, fontWeight: '700' }}>
        {running ? `⟳ ${t('sync.running')} · ` : ''}
        {has ? t('header.pendingSome', { count: total }) : t('header.pendingNone')}
        {unlocked ? '  ›' : ''}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: touch.minSize,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
