import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n/id';
import { colors, gradients, radius, spacing, touch } from '@/theme';

import { Icon } from './Icon';
import { PendingBadge } from './PendingBadge';
import { SecurityBanner } from './SecurityBanner';
import { Txt } from './Txt';

/**
 * Kerangka layar: header gradien membulat, pill "X data belum terkirim" yang mengambang
 * di tepi bawah header, banner peringatan, lalu konten di atas latar abu-lavender.
 */
export function Screen({
  title,
  subtitle,
  back,
  right,
  hero,
  children,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  /** Tampilkan tombol kembali di header. */
  back?: boolean;
  right?: ReactNode;
  /** Konten tambahan di dalam header (mis. kartu profil). */
  hero?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <View style={styles.side}>
            {back && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                onPress={() => router.back()}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              >
                <Icon name="chevron-left" size={32} color={colors.onPrimary} />
              </Pressable>
            )}
          </View>
          <View style={styles.titles}>
            <Txt variant="title" style={styles.title} numberOfLines={1}>
              {title}
            </Txt>
            {!!subtitle && (
              <Txt style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Txt>
            )}
          </View>
          <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
        </View>
        {hero}
      </View>
      <View style={styles.pillWrap}>
        <PendingBadge />
      </View>
      <SecurityBanner />
      <Body
        style={styles.body}
        contentContainerStyle={scroll ? [styles.content, { paddingBottom: insets.bottom + spacing.xl }] : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundImage: gradients.header,
    borderBottomLeftRadius: radius.lg + 12,
    borderBottomRightRadius: radius.lg + 12,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl + spacing.md,
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  side: { width: touch.minSize, minHeight: touch.minSize, justifyContent: 'center' },
  iconBtn: { width: touch.minSize, height: touch.minSize, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, alignItems: 'center' },
  title: { color: colors.onPrimary, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.onPrimary, textAlign: 'center', opacity: 0.95 },
  pillWrap: { marginTop: -(touch.minSize / 2 + 4), alignItems: 'center', paddingHorizontal: spacing.lg, zIndex: 2 },
  body: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
});
