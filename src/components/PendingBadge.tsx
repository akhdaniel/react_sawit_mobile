import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getPendingSummary, PENDING_WATCH_TABLES } from '@/db/repositories/pending';
import { useDb, useTableQuery } from '@/db/provider';
import { useSession } from '@/features/auth/session-store';
import { useSync } from '@/features/sync/sync-store';
import { t } from '@/i18n/id';
import { colors, radius, shadows, spacing, touch } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

/** Pill "X data belum terkirim" — selalu tampil; ketuk untuk ke layar Sinkron. */
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
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}
    >
      {running ? (
        <Icon name="sync" size={22} color={colors.primary} />
      ) : (
        <View style={[styles.dot, { backgroundColor: has ? colors.warning : colors.success }]} />
      )}
      <Txt style={styles.text}>
        {running ? `${t('sync.running')} · ` : ''}
        {has ? t('header.pendingSome', { count: total }) : t('header.pendingNone')}
      </Txt>
      {unlocked && <Icon name="chevron-right" size={24} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: touch.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    boxShadow: shadows.floating,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { fontWeight: '700', flexShrink: 1 },
});
