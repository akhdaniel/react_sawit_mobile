import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n/id';
import { colors, spacing, touch } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

/**
 * Pratinjau foto layar penuh: foto utuh (tidak terpotong) di latar gelap, geser kiri/kanan bila lebih dari satu.
 * `index` = foto yang dibuka; null = tertutup. Tombol kembali Android menutup pratinjau.
 */
export function PhotoViewer({ uris, index, onClose }: { uris: readonly string[]; index: number | null; onClose: () => void }) {
  return (
    <Modal visible={index != null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {index != null && <ViewerBody uris={uris} start={index} onClose={onClose} />}
    </Modal>
  );
}

function ViewerBody({ uris, start, onClose }: { uris: readonly string[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(start);

  return (
    <View style={styles.backdrop}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: start * width, y: 0 }}
        onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {uris.map((uri) => (
          <Image key={uri} source={{ uri }} style={{ width, height }} resizeMode="contain" accessibilityLabel={t('entry.photos')} />
        ))}
      </ScrollView>
      <View style={[styles.bar, { top: insets.top + spacing.sm }]}>
        {uris.length > 1 && <Txt style={styles.counter}>{`${current + 1}/${uris.length}`}</Txt>}
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
          <Icon name="close" size={32} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  bar: { position: 'absolute', right: spacing.md, left: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md },
  counter: { color: colors.onPrimary, fontWeight: '700' },
  close: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
