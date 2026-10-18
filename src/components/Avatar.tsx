import { StyleSheet, View } from 'react-native';

import { colors, gradients } from '@/theme';

import { Txt } from './Txt';

export function initials(name: string): string {
  const parts = name.replace(/^(Ir|Dr|Drs)\.\s*/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}

/** Lingkaran inisial bergradien dengan cincin putih. */
export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  return (
    <View style={[styles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]}>
      <View style={[styles.inner, { width: size, height: size, borderRadius: size / 2 }]}>
        <Txt style={{ color: colors.onPrimary, fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  inner: { backgroundImage: gradients.button, alignItems: 'center', justifyContent: 'center' },
});
