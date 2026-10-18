/**
 * Tombol "Tempel kartu NFC": membaca kartu pekerja dan mengembalikan data pekerja.
 * Disembunyikan otomatis pada HP tanpa NFC.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Txt } from '@/components/Txt';
import { findEmployeeByCard, type EmployeeRow } from '@/db/repositories/employee';
import { t } from '@/i18n/id';
import { cancelRead, nfcEnabled, nfcSupported, readCard } from '@/lib/nfc';
import { useServices } from '@/lib/services';
import { colors, spacing } from '@/theme';

export function NfcCardButton({ onEmployee }: { onEmployee: (e: EmployeeRow) => void }) {
  const { db } = useServices();
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void nfcSupported().then(setSupported);
  }, []);

  const start = async () => {
    setMessage(null);
    if (!(await nfcEnabled())) {
      setMessage(t('nfc.disabled'));
      setOpen(true);
      return;
    }
    setOpen(true);
    const card = await readCard();
    if (!card) {
      setOpen(false);
      return;
    }
    const emp = findEmployeeByCard(db, card);
    if (!emp) {
      setMessage(t('nfc.unknown'));
      return;
    }
    if (!emp.active) {
      setMessage(t('nfc.inactive', { name: emp.name }));
      return;
    }
    setOpen(false);
    onEmployee(emp);
  };

  if (!supported) return null;
  return (
    <>
      <Button kind="outline" icon="nfc-variant" label={t('nfc.tap')} onPress={() => void start()} />
      <Sheet
        visible={open}
        title={t('nfc.tap')}
        onClose={() => {
          cancelRead();
          setOpen(false);
        }}
      >
        <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
          <Icon name={message ? 'alert-circle' : 'nfc-tap'} size={72} color={message ? colors.danger : colors.primary} />
          {!message && <ActivityIndicator size="large" color={colors.primary} />}
          <Txt variant="large" style={{ textAlign: 'center', fontWeight: '700' }}>
            {message ?? t('nfc.waiting')}
          </Txt>
          {message === t('nfc.disabled') && <Button icon="cog" label={t('camera.openSettings')} onPress={() => void Linking.sendIntent('android.settings.NFC_SETTINGS').catch(() => Linking.openSettings())} />}
          {!!message && message !== t('nfc.disabled') && <Button icon="nfc-variant" label={t('common.retry')} onPress={() => void start()} />}
        </View>
      </Sheet>
    </>
  );
}
