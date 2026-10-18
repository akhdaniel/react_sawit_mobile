import { asc, inArray } from 'drizzle-orm';
import { useState } from 'react';

import { useTableQuery } from '@/db/provider';
import { getMeta, META_KEYS, setMeta } from '@/db/repositories/meta';
import { gang } from '@/db/schema';
import { useSession } from '@/features/auth/session-store';
import { useServices } from '@/lib/services';

/** Gang di afdeling pengguna + gang terpilih (diingat di app_meta). */
export function useGangSelection() {
  const { db } = useServices();
  const afdelingIds = useSession((s) => s.user?.afdeling_ids ?? []);
  const gangs = useTableQuery(['gang'], () =>
    afdelingIds.length ? db.select().from(gang).where(inArray(gang.afdelingId, afdelingIds)).orderBy(asc(gang.name)).all() : [],
  );
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const v = getMeta(db, META_KEYS.selectedGangId);
    return v ? Number(v) : null;
  });
  const selected = gangs.find((g) => g.id === selectedId) ?? gangs[0] ?? null;
  const select = (id: number) => {
    setSelectedId(id);
    setMeta(db, META_KEYS.selectedGangId, String(id));
  };
  return { gangs, selected, select };
}
