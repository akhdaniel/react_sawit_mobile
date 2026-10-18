import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { savedPrinter, savePrinter, printWithSavedPrinter } from '@/features/transport/print';
import { t } from '@/i18n/id';
import { EscPos } from '@/lib/escpos';
import { scanPrinters, type PrinterInfo } from '@/lib/printer';
import { useServices } from '@/lib/services';

export default function PrinterScreen() {
  const { db, device } = useServices();
  const current = useTableQuery(['app_meta'], () => savedPrinter(db));
  const [found, setFound] = useState<PrinterInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);

  const scan = async () => {
    setFound([]);
    setScanning(true);
    try {
      await scanPrinters(6000, (p) => setFound((f) => [...f, p]));
    } catch (e) {
      Alert.alert(t('printer.title'), e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const data = new EscPos().init().align('center').bold(true).line('XERPIUM SAWIT').bold(false).line(t('printer.testText')).line(device.deviceShort).feed(3).cut().build();
      await printWithSavedPrinter(db, data);
      Alert.alert(t('printer.title'), t('transport.printed'));
    } catch (e) {
      Alert.alert(t('printer.title'), t('printer.failed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen title={t('printer.title')} back>
      <SectionTitle>{t('printer.current')}</SectionTitle>
      <Card>
        <ListRow icon="printer" label={current?.name ?? t('printer.none')} description={current?.id} last />
      </Card>
      <Button icon="printer-check" kind="outline" label={t('printer.test')} disabled={!current} busy={testing} onPress={() => void test()} />
      <Button icon="bluetooth-audio" label={scanning ? t('printer.scanning') : t('printer.scan')} busy={scanning} onPress={() => void scan()} />
      {found.length > 0 && (
        <>
          <SectionTitle>{t('printer.found')}</SectionTitle>
          <Card>
            {found.map((p, i) => (
              <ListRow
                key={p.id}
                icon={current?.id === p.id ? 'check-circle' : 'bluetooth'}
                tone={current?.id === p.id ? 'success' : 'primary'}
                label={p.name}
                description={p.id}
                last={i === found.length - 1}
                onPress={() => savePrinter(db, p)}
              />
            ))}
          </Card>
        </>
      )}
      {!scanning && found.length === 0 && <Txt>{t('printer.none')}</Txt>}
    </Screen>
  );
}
