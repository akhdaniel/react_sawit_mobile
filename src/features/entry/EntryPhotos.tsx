import { eq } from 'drizzle-orm';
import { Image, ScrollView, StyleSheet } from 'react-native';

import { Card, SectionTitle } from '@/components/Card';
import { Txt } from '@/components/Txt';
import { useTableQuery } from '@/db/provider';
import { photo } from '@/db/schema';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import { radius, spacing } from '@/theme';

/** Foto bukti yang tersimpan di HP untuk satu transaksi (atau daftar id foto). */
export function EntryPhotos({ transactionUuid, photoIds }: { transactionUuid?: string; photoIds?: string[] }) {
  const { db } = useServices();
  const rows = useTableQuery(['photo', transactionUuid ?? '', (photoIds ?? []).join(',')], () => {
    const linked = transactionUuid ? db.select().from(photo).where(eq(photo.transactionUuid, transactionUuid)).all() : [];
    const byId = (photoIds ?? []).map((id) => db.select().from(photo).where(eq(photo.id, id)).get()).filter((p) => p != null);
    const seen = new Set<string>();
    return [...linked, ...byId].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  });

  return (
    <>
      <SectionTitle>{t('entry.photos')}</SectionTitle>
      {rows.length === 0 ? (
        <Card padded>
          <Txt>{t('entry.noPhoto')}</Txt>
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {rows.map((p) => (
            <Image key={p.id} source={{ uri: p.localUri }} style={styles.img} accessibilityLabel={t('entry.photos')} />
          ))}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  img: { width: 160, height: 120, borderRadius: radius.md },
});
