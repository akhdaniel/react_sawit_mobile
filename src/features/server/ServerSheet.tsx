/**
 * Ubah alamat server tanpa logout (mis. pindah Wi-Fi kantor / IP server berubah).
 * Uji koneksi dulu; alamat baru disimpan lalu sinkron bisa langsung dijalankan.
 * Data di HP tidak tersentuh — antrean tetap menunggu dan terkirim ke alamat baru.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { t } from '@/i18n/id';
import { apiBaseUrlSchema } from '@/lib/config';
import { useServices } from '@/lib/services';
import { checkServer, type ServerCheckResult } from '@/sync/server-check';
import { colors, radius, spacing } from '@/theme';

export function ServerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const services = useServices();
  const [url, setUrl] = useState(services.getBaseUrl());
  const [result, setResult] = useState<ServerCheckResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = apiBaseUrlSchema.safeParse(url.trim());

  const test = async (): Promise<ServerCheckResult | null> => {
    setError(null);
    setResult(null);
    if (!parsed.success) {
      setError(t('server.invalid'));
      return null;
    }
    setTesting(true);
    try {
      const r = await checkServer(parsed.data);
      setResult(r);
      return r;
    } finally {
      setTesting(false);
    }
  };

  const saveAndSync = async () => {
    const r = result ?? (await test());
    if (!r?.ok || !parsed.success) return;
    services.setBaseUrl(parsed.data);
    onClose();
    void services.sync().catch(() => undefined);
  };

  return (
    <Sheet
      visible={visible}
      title={t('server.title')}
      onClose={() => {
        setResult(null);
        setError(null);
        onClose();
      }}
    >
      <Txt>{t('server.hint')}</Txt>
      <TextField
        label={t('auth.serverUrl')}
        value={url}
        onChangeText={(v) => {
          setUrl(v);
          setResult(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={error ?? undefined}
      />
      {result && (
        <View style={[styles.result, { backgroundColor: result.ok ? colors.successSoft : colors.dangerSoft }]}>
          <Icon name={result.ok ? 'check-circle' : 'lan-disconnect'} size={24} color={result.ok ? colors.success : colors.danger} />
          <Txt style={{ flex: 1, fontWeight: '700' }}>
            {result.ok ? t('server.ok', { ms: result.latencyMs }) : `${t(`server.${result.reason}`)} (${result.detail})`}
          </Txt>
        </View>
      )}
      <Button kind="outline" icon="lan-check" label={t('server.test')} busy={testing} onPress={() => void test()} />
      <Button icon="content-save" label={t('server.saveSync')} disabled={testing || (result != null && !result.ok)} onPress={() => void saveAndSync()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
});
