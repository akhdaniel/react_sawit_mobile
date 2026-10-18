import { randomUUID } from 'expo-crypto';

import { createUpkeep, validateUpkeep, type MaterialInput, type UpkeepInput, type UpkeepIssue } from '@/db/repositories/upkeep';
import type { AppDatabase } from '@/db/types';
import type { CapturedPhoto } from '@/features/camera/CameraCapture';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';
import { photoRowFor } from '@/features/harvest/actions';

export type UpkeepResult = { ok: true; upkeepUuid: string; overDose: number } | { ok: false; issues: UpkeepIssue[] };

export function saveUpkeep(db: AppDatabase, ctx: TxContext, input: UpkeepInput, materials: MaterialInput[], photo?: CapturedPhoto): UpkeepResult {
  const issues = validateUpkeep(db, input, materials);
  if (issues.length) return { ok: false, issues };
  const r = createUpkeep(
    db,
    makeTxCommon(ctx, randomUUID()),
    input,
    materials.map((m) => ({ ...m, common: makeTxCommon(ctx, randomUUID()) })),
    photo ? photoRowFor(photo, ctx) : undefined,
  );
  return { ok: true, ...r };
}
