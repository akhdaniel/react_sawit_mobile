/**
 * Lembar "Temuan baru" di form inspeksi: kategori, tingkat, uraian singkat, baris & nomor pokok (opsional),
 * QR pokok, foto (wajib untuk mayor/kritis). Lokasi diambil otomatis saat inspeksi disimpan.
 */
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { NumberStepper } from '@/components/NumberStepper';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import type { FindingInput } from '@/db/repositories/inspection';
import { CameraCapture, type CapturedPhoto } from '@/features/camera/CameraCapture';
import { t } from '@/i18n/id';
import { FINDING_CATEGORIES, FINDING_SEVERITIES, type FindingSeverity } from '@/sync/contract';
import { colors, radius, spacing } from '@/theme';

export interface FindingDraft {
  finding: FindingInput;
  photos: CapturedPhoto[];
}

/** Nilai awal lembar: dari item buruk (kategori & tingkat bawaan item) atau temuan umum. */
export interface FindingPreset {
  itemId: number | null;
  itemName?: string;
  category: string | null;
  severity: FindingSeverity;
  description: string;
}

/** Lembar tampil selama `preset` terisi; isinya dipasang ulang setiap kali dibuka (form mulai dari preset). */
export function FindingSheet({
  preset,
  onSave,
  onClose,
}: {
  preset: FindingPreset | null;
  onSave: (draft: FindingDraft) => void;
  onClose: () => void;
}) {
  return preset ? <FindingForm preset={preset} onSave={onSave} onClose={onClose} /> : null;
}

function FindingForm({ preset, onSave, onClose }: { preset: FindingPreset; onSave: (draft: FindingDraft) => void; onClose: () => void }) {
  const [category, setCategory] = useState<string>(preset.category ?? 'lainnya');
  const [severity, setSeverity] = useState<FindingSeverity>(preset.severity);
  const [description, setDescription] = useState(preset.description);
  const [rowNo, setRowNo] = useState(0);
  const [treeNo, setTreeNo] = useState(0);
  const [qr, setQr] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [camera, setCamera] = useState(false);

  const needsPhoto = severity !== 'minor' && photos.length === 0;
  const canSave = !!description.trim() && !needsPhoto;

  const save = () => {
    if (!canSave) return;
    onSave({
      finding: {
        findingUuid: randomUUID(),
        itemId: preset.itemId,
        category,
        severity,
        description: description.trim(),
        rowNo: rowNo || null,
        treeNo: treeNo || null,
        palmTreeQr: qr.trim() || null,
        lat: null,
        lng: null,
        photoIds: photos.map((p) => p.id),
      },
      photos,
    });
  };

  return (
    <>
      <Sheet visible={!camera} title={t('finding.sheetTitle')} onClose={onClose}>
        {preset.itemName && (
          <Txt variant="small" style={{ color: colors.textMuted }}>
            {t('finding.fromItem', { item: preset.itemName })}
          </Txt>
        )}
        <Txt style={styles.label}>{t('finding.severity')}</Txt>
        <View style={styles.wrap}>
          {FINDING_SEVERITIES.map((s) => (
            <Chip key={s} label={t(`finding.severities.${s}`)} selected={s === severity} onPress={() => setSeverity(s)} />
          ))}
        </View>
        <Txt style={styles.label}>{t('finding.category')}</Txt>
        <View style={styles.wrap}>
          {FINDING_CATEGORIES.map((c) => (
            <Chip key={c} label={t(`finding.categories.${c}`)} selected={c === category} onPress={() => setCategory(c)} />
          ))}
        </View>
        <TextField label={t('finding.description')} value={description} onChangeText={setDescription} multiline />
        {/* Bertumpuk, selebar penuh: berdampingan, tombol −/+ menyisakan kotak angka yang terlalu sempit. */}
        <NumberStepper label={t('finding.rowNo')} value={rowNo} onChange={(n) => setRowNo(Math.max(0, Math.round(n)))} />
        <NumberStepper label={t('finding.treeNo')} value={treeNo} onChange={(n) => setTreeNo(Math.max(0, Math.round(n)))} />
        <TextField label={t('finding.qr')} value={qr} onChangeText={setQr} autoCapitalize="characters" />

        <Txt style={styles.label}>{t('finding.photo')}</Txt>
        {photos.length > 0 && (
          <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
            {photos.map((p) => (
              <Image key={p.id} source={{ uri: p.localUri }} style={styles.img} accessibilityLabel={t('finding.photo')} />
            ))}
          </ScrollView>
        )}
        <Button kind="outline" icon="camera" label={t('inspection.addPhoto')} onPress={() => setCamera(true)} />
        {needsPhoto && (
          <Txt variant="small" style={{ color: colors.danger, fontWeight: '700' }}>
            {t('finding.photoRequired')}
          </Txt>
        )}
        <Button icon="alert-plus" label={t('finding.add')} disabled={!canSave} onPress={save} />
      </Sheet>
      <CameraCapture
        visible={camera}
        title={t('finding.photo')}
        onCaptured={(p) => {
          setPhotos((ps) => [...ps, p]);
          setCamera(false);
        }}
        onCancel={() => setCamera(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  img: { width: 120, height: 90, borderRadius: radius.md },
});
