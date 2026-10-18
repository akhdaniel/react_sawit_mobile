import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useSession } from '@/features/auth/session-store';
import { canAccess, MENU, type MenuKey } from '@/features/menu/menu';
import { t } from '@/i18n/id';

/** Placeholder modul yang belum dibangun; juga menolak akses lintas peran. */
export default function ModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const roles = useSession((s) => s.user?.roles ?? []);
  const item = MENU.find((m) => m.key === key);
  const allowed = !!item && canAccess(item.key as MenuKey, roles);

  return (
    <Screen title={item ? t(item.label) : '—'}>
      <Txt variant="large">{allowed && item ? t('menu.comingSoon', { stage: item.stage }) : t('menu.forbidden')}</Txt>
      <Button kind="outline" label={t('common.back')} onPress={() => router.back()} />
    </Screen>
  );
}
