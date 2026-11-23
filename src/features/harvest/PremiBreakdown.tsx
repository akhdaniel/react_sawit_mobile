/** Rincian estimasi premi per komponen tarif panen ERP (sama dengan tab Rincian Upah tiket ERP). */
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { formatRupiah, type PremiEstimate, type WageLine } from '@/features/harvest/calc';
import { t } from '@/i18n/id';
import { colors, spacing } from '@/theme';

function quantityLabel(line: WageLine): string {
  const rate = formatRupiah(line.amount);
  if (line.bjrKg) return t('harvest.wageQtyBjr', { bunches: line.bunches, bjr: line.bjrKg, rate });
  return t('harvest.wageQty', { qty: line.quantity, unit: t(line.unit === 'kg' ? 'harvest.unitKg' : 'harvest.unitBunch'), rate });
}

export function PremiBreakdown({ premi }: { premi: PremiEstimate }) {
  if (!premi.hasRate) {
    return (
      <Txt variant="small" style={{ color: colors.danger }}>
        {t('harvest.noRate')}
      </Txt>
    );
  }
  return (
    <View style={styles.wrap}>
      {premi.lines.map((line) => (
        <View key={`${line.grade}-${line.lineType}`} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt variant="small" style={{ fontWeight: '700' }}>{t(`harvest.grade.${line.grade}`)}</Txt>
            <Txt variant="small" style={{ color: colors.textMuted }}>{quantityLabel(line)}</Txt>
          </View>
          <Txt variant="small" style={{ fontWeight: '700', color: line.subtotal < 0 ? colors.danger : colors.text }}>
            {line.subtotal < 0 ? `−${formatRupiah(-line.subtotal)}` : formatRupiah(line.subtotal)}
          </Txt>
        </View>
      ))}
      <Txt variant="small" style={{ color: colors.textMuted }}>{t('harvest.premiNote')}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
