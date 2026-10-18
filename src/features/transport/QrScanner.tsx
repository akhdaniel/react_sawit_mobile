/** Pemindai QR (VisionCamera v5 + ML Kit barcode scanner). Memanggil onCode untuk setiap kode baru. */
import { useMemo, useRef } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useBarcodeScannerOutput, type TargetBarcodeFormat } from 'react-native-vision-camera-barcode-scanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CenterMessage } from '@/components/CenterMessage';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { t } from '@/i18n/id';
import { colors, radius, spacing, touch } from '@/theme';

export function QrScanner({
  visible,
  title,
  footer,
  onCode,
  onClose,
}: {
  visible: boolean;
  title: string;
  footer?: string;
  onCode: (raw: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible && <ScannerBody title={title} footer={footer} onCode={onCode} onClose={onClose} />}
    </Modal>
  );
}

// Konstanta di luar komponen agar referensinya stabil (output tidak dibuat ulang).
const FORMATS: TargetBarcodeFormat[] = ['qr-code'];

function ScannerBody({ title, footer, onCode, onClose }: { title: string; footer?: string; onCode: (raw: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const permission = useCameraPermission();
  const device = useCameraDevice('back');
  const recent = useRef(new Map<string, number>());
  const scanner = useBarcodeScannerOutput({
    barcodeFormats: FORMATS,
    onBarcodeScanned(codes) {
      const now = Date.now();
      for (const c of codes) {
        const raw = c.rawValue;
        if (!raw) continue;
        // Abaikan kode yang sama dalam 3 detik (kamera membaca berkali-kali per detik).
        if ((recent.current.get(raw) ?? 0) > now - 3000) continue;
        recent.current.set(raw, now);
        Vibration.vibrate(60);
        onCode(raw);
      }
    },
    onError() {
      // kesalahan pemindaian sesaat diabaikan
    },
  });

  const outputs = useMemo(() => [scanner], [scanner]);

  if (!permission.hasPermission) {
    return (
      <CenterMessage text={`${t('camera.permissionTitle')}\n${t('camera.permissionHint')}`}>
        {permission.canRequestPermission ? (
          <Button icon="camera" label={t('camera.allow')} onPress={() => void permission.requestPermission()} />
        ) : (
          <Button icon="cog" label={t('camera.openSettings')} onPress={() => void Linking.openSettings()} />
        )}
        <Button kind="outline" label={t('common.cancel')} onPress={onClose} />
      </CenterMessage>
    );
  }
  if (!device) {
    return (
      <CenterMessage text={t('camera.noDevice')}>
        <Button kind="outline" label={t('common.cancel')} onPress={onClose} />
      </CenterMessage>
    );
  }

  return (
    <View style={styles.root}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={outputs} resizeMode="cover" />
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onClose} style={styles.btn}>
          <Icon name="close" size={30} color={colors.onPrimary} />
        </Pressable>
        <Txt variant="large" style={styles.title}>
          {title}
        </Txt>
        <View style={styles.btn} />
      </View>
      <View style={styles.frame} pointerEvents="none" />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        {!!footer && <Txt style={styles.footer}>{footer}</Txt>}
        <Button label={t('common.back')} icon="check" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, backgroundColor: 'rgba(0,0,0,0.45)', paddingBottom: spacing.sm },
  btn: { width: touch.minSize, height: touch.minSize, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.onPrimary, textAlign: 'center', fontWeight: '800' },
  frame: { alignSelf: 'center', marginTop: '25%', width: 260, height: 260, borderRadius: radius.lg, borderWidth: 4, borderColor: colors.onPrimary },
  bottom: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 0, gap: spacing.md },
  footer: { color: colors.onPrimary, fontWeight: '700', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: spacing.sm, borderRadius: radius.md },
});
