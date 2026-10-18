/**
 * Persetujuan asisten — bekerja offline dari inbox yang ditarik saat sinkron.
 * Keputusan disimpan sebagai transaksi approval_decision dan dikirim saat sinkron.
 */
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { StatusPill } from '@/components/StatusPill';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { pendingInbox, type DecisionKind, type InboxRow } from '@/db/repositories/approval';
import { decide } from '@/features/report/actions';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { spacing } from '@/theme';

const flagLabel = (f: string) => {
  const key = `approval.flag.${f}`;
  const label = t(key as never);
  return label === key ? f : label;
};

const ICON: Record<string, string> = {
  attendance: 'account-check',
  assignment: 'clipboard-account',
  harvest_ticket: 'palm-tree',
  spb: 'truck',
  upkeep: 'sprout',
  material_usage: 'flask',
};

export default function ApprovalScreen() {
  const services = useServices();
  const { db } = services;
  const items = useTableQuery(['approval_inbox', 'approval_decision'], () => pendingInbox(db));
  const [open, setOpen] = useState<InboxRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (kind: DecisionKind) => {
    if (!open) return;
    setBusy(true);
    try {
      const r = decide(db, await services.txContext(), open.targetUuid, kind, note);
      if (!r.ok) {
        Alert.alert(t('approval.title'), t(`approval.error.${r.code}`));
        return;
      }
      setOpen(null);
      setNote('');
      Alert.alert(t('approval.title'), t('approval.decided'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('approval.title')} back>
      <SectionTitle>{t('approval.inbox', { count: items.length })}</SectionTitle>
      {items.length === 0 ? (
        <Card padded>
          <Txt>{t('approval.empty')}</Txt>
        </Card>
      ) : (
        <Card>
          {items.map((i, n) => (
            <ListRow
              key={i.targetUuid}
              icon={(ICON[i.targetType] ?? 'file-document') as never}
              tone={i.flags.some((f) => f === 'mocked_gps' || f === 'rooted_device' || f === 'over_dose') ? 'danger' : 'accent'}
              label={i.summary}
              description={i.flags.map(flagLabel).join(' · ')}
              last={n === items.length - 1}
              onPress={() => {
                setNote('');
                setOpen(i);
              }}
            />
          ))}
        </Card>
      )}

      <Sheet visible={!!open} title={open?.summary ?? ''} onClose={() => setOpen(null)}>
        {open && (
          <>
            <View style={styles.flags}>
              {open.flags.map((f) => (
                <StatusPill key={f} label={flagLabel(f)} tone="warning" />
              ))}
            </View>
            <Txt variant="small">{open.targetUuid}</Txt>
            <TextField label={t('approval.note')} value={note} onChangeText={setNote} multiline />
            <Button icon="check-decagram" label={t('approval.approve')} busy={busy} onPress={() => void submit('approve')} />
            <Button kind="outline" icon="pencil" label={t('approval.correct')} disabled={busy} onPress={() => void submit('correct')} />
            <Button kind="danger" icon="close-octagon" label={t('approval.reject')} disabled={busy} onPress={() => void submit('reject')} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
