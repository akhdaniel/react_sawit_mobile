/**
 * Kamera dalam aplikasi (VisionCamera v5). Satu-satunya sumber foto bukti — tidak ada
 * akses galeri. Hasil diproses: kompres ≤ 300 KB, simpan privat, hash SHA-256.
 */
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Camera, CommonResolutions, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CenterMessage } from '@/components/CenterMessage';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { t } from '@/i18n/id';
import { processPhoto, type ProcessedPhoto } from '@/lib/photo';
import { expoPhotoIO } from '@/lib/photo.expo';
import { colors, spacing, touch } from '@/theme';

export interface CapturedPhoto extends ProcessedPhoto {
  id: string;
}

export function CameraCapture({
  visible,
  title,
  onCaptured,
  onCancel,
}: {
  visible: boolean;
  title: string;
  onCaptured: (photo: CapturedPhoto) => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      {visible && <CameraBody title={title} onCaptured={onCaptured} onCancel={onCancel} />}
    </Modal>
  );
}

function CameraBody({ title, onCaptured, onCancel }: { title: string; onCaptured: (p: CapturedPhoto) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const permission = useCameraPermission();
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(position);
  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.FHD_4_3, qualityPrioritization: 'speed' });
  // Referensi array harus stabil: array baru tiap render membuat sesi kamera dikonfigurasi ulang.
  const outputs = useMemo(() => [photoOutput], [photoOutput]);
  /** Sesi kamera sudah berjalan (onStarted) — tombol rana baru aktif setelah ini. */
  const [ready, setReady] = useState(false);
  /** Sedang mengambil gambar: kamera WAJIB tetap aktif. */
  const [capturing, setCapturing] = useState(false);
  /** Sedang kompres/hash: kamera boleh dimatikan untuk hemat baterai. */
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = capturing || processing;

  if (!permission.hasPermission) {
    return (
      <CenterMessage text={`${t('camera.permissionTitle')}\n${t('camera.permissionHint')}`}>
        {permission.canRequestPermission ? (
          <Button icon="camera" label={t('camera.allow')} onPress={() => void permission.requestPermission()} />
        ) : (
          <Button icon="cog" label={t('camera.openSettings')} onPress={() => void Linking.openSettings()} />
        )}
        <Button kind="outline" label={t('common.cancel')} onPress={onCancel} />
      </CenterMessage>
    );
  }
  if (!device) {
    return (
      <CenterMessage text={t('camera.noDevice')}>
        <Button kind="outline" label={t('common.cancel')} onPress={onCancel} />
      </CenterMessage>
    );
  }

  const shoot = async () => {
    if (!ready || busy) return;
    setError(null);
    let rawPath: string;
    setCapturing(true);
    try {
      rawPath = (await photoOutput.capturePhotoToFile({}, {})).filePath;
    } catch (e) {
      setError(t('camera.failed', { message: e instanceof Error ? e.message : String(e) }));
      return;
    } finally {
      setCapturing(false);
    }
    setProcessing(true);
    try {
      const id = randomUUID();
      const processed = await processPhoto(rawPath, id, expoPhotoIO);
      onCaptured({ id, ...processed });
    } catch (e) {
      setError(t('camera.failed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!processing}
        outputs={outputs}
        resizeMode="cover"
        onStarted={() => setReady(true)}
        onStopped={() => setReady(false)}
        onError={(e) => {
          setReady(false);
          setError(t('camera.failed', { message: e.message }));
        }}
      />
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onCancel} style={styles.roundBtn}>
          <Icon name="close" size={30} color={colors.onPrimary} />
        </Pressable>
        <Txt variant="large" style={styles.title} numberOfLines={2}>
          {title}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('camera.flip')}
          disabled={busy}
          onPress={() => {
            setReady(false);
            setPosition((p) => (p === 'back' ? 'front' : 'back'));
          }}
          style={styles.roundBtn}
        >
          <Icon name="camera-flip" size={30} color={colors.onPrimary} />
        </Pressable>
      </View>
      {!!error && (
        <View style={styles.error}>
          <Txt style={{ color: colors.onDanger, fontWeight: '700' }}>{error}</Txt>
        </View>
      )}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        {(processing || !ready) && <Txt style={styles.processing}>{processing ? t('camera.processing') : t('camera.starting')}</Txt>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('camera.shutter')}
          accessibilityState={{ disabled: !ready || busy, busy }}
          disabled={!ready || busy}
          onPress={() => void shoot()}
          style={({ pressed }) => [styles.shutter, (pressed || busy || !ready) && { opacity: 0.5 }]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const SHUTTER = 84;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, gap: spacing.sm, backgroundColor: 'rgba(0,0,0,0.45)', paddingBottom: spacing.sm },
  title: { flex: 1, color: colors.onPrimary, fontWeight: '800', textAlign: 'center' },
  roundBtn: { width: touch.minSize, height: touch.minSize, alignItems: 'center', justifyContent: 'center' },
  error: { margin: spacing.md, padding: spacing.md, borderRadius: 12, backgroundColor: colors.danger },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  processing: { color: colors.onPrimary, fontWeight: '700' },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 6, borderColor: colors.onPrimary, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: SHUTTER - 22, height: SHUTTER - 22, borderRadius: (SHUTTER - 22) / 2, backgroundColor: colors.onPrimary },
});
