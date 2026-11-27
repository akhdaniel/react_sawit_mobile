/**
 * Satu kartu item checklist: kontrol sesuai tipe isian (≤ 3 ketukan), tanda merah bila isian "buruk",
 * dan tombol "+ Temuan" yang sudah terisi kategori & tingkat bawaan item.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { NumberStepper } from '@/components/NumberStepper';
import { StatusPill } from '@/components/StatusPill';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import type { InspectionItemRow } from '@/db/repositories/inspection';
import type { InspectionLine } from '@/db/schema';
import { t } from '@/i18n/id';
import { colors, radius, spacing, touch } from '@/theme';

const SCORES = [1, 2, 3, 4, 5] as const;

export function emptyLine(itemId: number): InspectionLine {
  return { item_id: itemId, value_num: null, value_bool: null, value_text: null };
}

export function ItemInput({
  item,
  line,
  bad,
  hasFinding,
  onChange,
  onAddFinding,
}: {
  item: InspectionItemRow;
  line: InspectionLine;
  bad: boolean;
  /** Item ini sudah punya temuan di inspeksi ini. */
  hasFinding: boolean;
  onChange: (line: InspectionLine) => void;
  onAddFinding: () => void;
}) {
  const set = (patch: Partial<InspectionLine>) => onChange({ ...line, ...patch });
  const label = `${item.name}${item.uom ? ` (${item.uom})` : ''}`;

  return (
    <Card padded style={bad ? styles.bad : undefined}>
      <View style={styles.head}>
        <Txt style={[styles.name, bad && { color: colors.danger }]}>{label}</Txt>
        {item.required && <StatusPill label={t('inspection.required')} tone="neutral" />}
        {bad && <StatusPill label={t('inspection.bad')} tone="danger" />}
      </View>

      {(item.valueType === 'count' || item.valueType === 'number') && (
        <NumberStepper
          label={item.code}
          value={line.value_num ?? 0}
          onChange={(n) => set({ value_num: item.valueType === 'count' ? Math.max(0, Math.round(n)) : n })}
          step={1}
          decimal={item.valueType === 'number'}
        />
      )}

      {item.valueType === 'bool' && (
        // Seperti ERP, Ya/Tidak yang belum disentuh bernilai Tidak (ikut dinilai).
        <View style={styles.row}>
          {([true, false] as const).map((v) => {
            const on = (line.value_bool ?? false) === v;
            return (
              <Pressable
                key={String(v)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => set({ value_bool: v })}
                style={[styles.big, on ? styles.bigOn : styles.bigOff]}
              >
                <Txt style={[styles.bigLabel, on && { color: colors.onPrimary }]}>{t(v ? 'inspection.yes' : 'inspection.no')}</Txt>
              </Pressable>
            );
          })}
        </View>
      )}

      {item.valueType === 'score_1_5' && (
        // Tombol kotak tanpa padding samping: lima skor muat satu baris di layar HP sempit.
        <View style={styles.row}>
          {SCORES.map((n) => {
            const on = line.value_num === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => set({ value_num: on ? null : n })}
                style={[styles.big, on ? styles.bigOn : styles.bigOff]}
              >
                <Txt style={[styles.bigLabel, on && { color: colors.onPrimary }]}>{n}</Txt>
              </Pressable>
            );
          })}
        </View>
      )}

      {item.valueType === 'select' && (
        <View style={styles.wrap}>
          {item.selectOptions.map((o) => (
            <Chip key={o} label={o} selected={line.value_text === o} onPress={() => set({ value_text: line.value_text === o ? null : o })} />
          ))}
        </View>
      )}

      {item.valueType === 'text' && <TextField label={item.code} value={line.value_text ?? ''} onChangeText={(v) => set({ value_text: v || null })} />}

      {bad && !hasFinding && (
        <Pressable accessibilityRole="button" onPress={onAddFinding} style={styles.finding}>
          <Txt style={{ color: colors.onDanger, fontWeight: '800' }}>{t('inspection.addFinding')}</Txt>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bad: { borderWidth: 2, borderColor: colors.danger },
  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  name: { flex: 1, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  big: { flex: 1, minHeight: touch.minSize + 8, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  bigOn: { backgroundColor: colors.primary },
  bigOff: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
  bigLabel: { fontSize: 20, fontWeight: '800' },
  finding: {
    minHeight: touch.minSize,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
