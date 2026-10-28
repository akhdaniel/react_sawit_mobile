import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n/id';
import { colors, radius, spacing, touch } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

/** Bottom sheet modal dengan judul dan tombol tutup 56 dp. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Sheet terangkat di atas keyboard agar input di dalamnya tetap terlihat. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.cancel')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Txt variant="large" style={{ flex: 1, fontWeight: '800' }}>
              {title}
            </Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onClose} style={styles.close}>
              <Icon name="close" size={28} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(27, 22, 48, 0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
  },
  handle: { alignSelf: 'center', width: 48, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm },
  close: { width: touch.minSize, height: touch.minSize, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.md, gap: spacing.md },
});
