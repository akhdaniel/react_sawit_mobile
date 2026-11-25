/**
 * Ubah alamat server. Uji koneksi dulu, lalu bandingkan server_id server tujuan dengan server data di HP:
 * - server yang sama (mis. pindah Wi-Fi kantor / IP server berubah): alamat disimpan tanpa logout, antrean
 *   terkirim ke alamat baru;
 * - server lain: ditolak selama ada transaksi/foto belum terkirim (milik server lama); bila kosong, sesi dan
 *   data server lama dihapus lalu pengguna login ulang di server baru.
 */
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { getPendingSummary, PENDING_WATCH_TABLES } from '@/db/repositories/pending';
import { useSession } from '@/features/auth/session-store';
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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useTableQuery(PENDING_WATCH_TABLES, () => getPendingSummary(services.db));

  const parsed = apiBaseUrlSchema.safeParse(url.trim());
  const knownServer = services.getServerId();
  // Server lama tanpa server_id atau HP belum mencatatnya: dianggap server yang sama (perilaku sebelumnya).
  const otherServer = result?.ok === true && result.serverId != null && knownServer != null && result.serverId !== knownServer;
  const sameServer = result?.ok === true && result.serverId != null && result.serverId === knownServer;
  const pendingTotal = pending.total + pending.photos;

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
    if (r.serverId != null && knownServer != null && r.serverId !== knownServer) return; // lewat tombol pindah server
    services.setBaseUrl(parsed.data);
    onClose();
    void services.sync().catch(() => undefined);
  };

  const syncOld = async () => {
    setSyncing(true);
    try {
      await services.sync();
    } catch {
      // Hasil sinkron tampil di layar Sinkron; jumlah pending di atas ikut diperbarui.
    } finally {
      setSyncing(false);
    }
  };

  const switchServer = () => {
    if (!parsed.success) return;
    const target = parsed.data;
    Alert.alert(t('server.switchLogin'), t('server.switchConfirm', { url: target }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('server.switchLogin'),
        style: 'destructive',
        onPress: () =>
          void services
            .switchServer(target)
            .then(() => {
              onClose();
              useSession.getState().signedOut();
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
      },
    ]);
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
      {sameServer && <Txt style={{ color: colors.textMuted }}>{t('server.sameServer')}</Txt>}
      {otherServer && (
        <View style={[styles.result, { backgroundColor: colors.warningSoft }]}>
          <Icon name="swap-horizontal" size={24} color={colors.warning} />
          <Txt style={{ flex: 1 }}>{t('server.otherServer')}</Txt>
        </View>
      )}
      {otherServer && pendingTotal > 0 && (
        <View style={[styles.result, { backgroundColor: colors.dangerSoft }]}>
          <Icon name="cloud-upload" size={24} color={colors.danger} />
          <Txt style={{ flex: 1, fontWeight: '700' }}>{t('server.pendingBlock', { tx: pending.total, photos: pending.photos })}</Txt>
        </View>
      )}
      <Button kind="outline" icon="lan-check" label={t('server.test')} busy={testing} onPress={() => void test()} />
      {otherServer ? (
        pendingTotal > 0 ? (
          <Button icon="sync" label={t('server.syncOld')} busy={syncing} onPress={() => void syncOld()} />
        ) : (
          <Button icon="swap-horizontal" label={t('server.switchLogin')} onPress={switchServer} />
        )
      ) : (
        <Button icon="content-save" label={t('server.saveSync')} disabled={testing || (result != null && !result.ok)} onPress={() => void saveAndSync()} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
});
