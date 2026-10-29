import { StyleSheet, View } from 'react-native';

import { StatusPill, type PillTone } from '@/components/StatusPill';
import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { t } from '@/i18n/id';
import { colors, radius, spacing } from '@/theme';

type TxStatus = 'draft' | 'queued' | 'sent' | 'accepted' | 'rejected' | 'posted';

const toneByStatus: Record<TxStatus, PillTone> = {
  draft: 'neutral',
  queued: 'warning',
  sent: 'primary',
  accepted: 'success',
  rejected: 'danger',
  posted: 'success',
};

/** Pita di atas form entry yang dibuka ulang: data tersimpan (append-only), status, waktu simpan. */
export function SavedEntryNotice({ status, savedAt, children }: { status: TxStatus; savedAt: string; children?: React.ReactNode }) {
  return (
    <View style={styles.box} accessibilityRole="summary">
      <View style={styles.row}>
        <Icon name="lock" size={22} color={colors.primary} />
        <Txt style={{ flex: 1, fontWeight: '700' }}>{t('entry.readOnly')}</Txt>
      </View>
      <View style={styles.pills}>
        <StatusPill label={t(`status.${status}`)} tone={toneByStatus[status]} />
        <StatusPill label={t('entry.savedAt', { time: new Date(savedAt).toLocaleString('id-ID') })} tone="neutral" />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
