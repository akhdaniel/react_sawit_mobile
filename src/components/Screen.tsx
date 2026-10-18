import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

import { PendingBadge } from './PendingBadge';
import { Txt } from './Txt';

/** Kerangka layar: judul + indikator data belum terkirim + konten. */
export function Screen({ title, children, scroll = true }: { title: string; children: ReactNode; scroll?: boolean }) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Txt variant="title" style={{ color: colors.onPrimary }}>
          {title}
        </Txt>
      </View>
      <PendingBadge />
      <Body style={styles.body} contentContainerStyle={scroll ? styles.content : undefined}>
        {children}
      </Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  body: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
});
