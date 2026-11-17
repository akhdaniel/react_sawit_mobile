/** Dokumen ERP dari transaksi ini (tiket panen / SPB / tiket pemupukan): nomor, status & tahap ERP, netto timbang. */
import { StyleSheet, View } from 'react-native';

import { Card, SectionTitle } from '@/components/Card';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { getDocument } from '@/db/repositories/documents';
import type { TxStatus } from '@/db/tx-status';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export function DocumentStatus({ mobileUuid, status }: { mobileUuid: string; status: TxStatus }) {
  const { db } = useServices();
  const doc = useTableQuery(['tx_document', mobileUuid], () => getDocument(db, mobileUuid));
  if (!doc) {
    if (status !== 'accepted' && status !== 'posted') return null;
    return (
      <Txt variant="small" style={{ color: colors.textMuted }}>
        {t('document.waiting')}
      </Txt>
    );
  }
  const rows: [string, string][] = [
    [t('document.number'), doc.name],
    [t('document.state'), doc.stateLabel ?? doc.state],
  ];
  if (doc.stage) rows.push([t('document.stage'), doc.stage]);
  if (doc.netKg) rows.push([t('document.netKg'), `${Math.round(doc.netKg).toLocaleString('id-ID')} kg`]);
  return (
    <>
      <SectionTitle>{t('document.title')}</SectionTitle>
      <Card padded>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Txt style={{ flex: 1, color: colors.textMuted }}>{label}</Txt>
            <Txt style={{ fontWeight: '700' }}>{value}</Txt>
          </View>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
});
