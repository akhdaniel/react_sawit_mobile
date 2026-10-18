import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { Txt } from './Txt';

export function CenterMessage({ text, busy, children }: { text: string; busy?: boolean; children?: ReactNode }) {
  return (
    <View style={styles.root}>
      {busy && <ActivityIndicator size="large" color={colors.primary} />}
      <Txt variant="large" style={styles.text}>
        {text}
      </Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  text: { textAlign: 'center' },
});
