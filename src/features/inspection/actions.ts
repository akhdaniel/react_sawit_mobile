import { randomUUID } from 'expo-crypto';

import {
  createFollowup,
  createInspection,
  validateFollowup,
  validateInspection,
  type FollowupErrorCode,
  type FollowupInput,
  type InspectionErrorCode,
  type InspectionInput,
  type InspectionUser,
} from '@/db/repositories/inspection';
import type { AppDatabase } from '@/db/types';
import type { CapturedPhoto } from '@/features/camera/CameraCapture';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';
import { photoRowFor } from '@/features/harvest/actions';
import type { Role } from '@/sync/contract';

export type InspectionResult = { ok: true; mobileUuid: string } | { ok: false; issues: InspectionErrorCode[] };
export type FollowupResult = { ok: true; mobileUuid: string } | { ok: false; issues: FollowupErrorCode[] };

/** Validasi (aturan sama dengan server) + simpan inspeksi, temuan, dan foto barunya dalam satu transaksi DB. */
export function saveInspection(
  db: AppDatabase,
  ctx: TxContext,
  input: InspectionInput,
  user: InspectionUser,
  photos: readonly CapturedPhoto[],
): InspectionResult {
  const issues = validateInspection(db, input, user);
  if (issues.length) return { ok: false, issues };
  const common = makeTxCommon(ctx, randomUUID(), input.correctionOf ?? null);
  const rows = photos.map((p) => photoRowFor(p, ctx));
  return { ok: true, mobileUuid: createInspection(db, common, input, rows) };
}

export function saveFollowup(
  db: AppDatabase,
  ctx: TxContext,
  input: FollowupInput,
  roles: readonly Role[],
  photos: readonly CapturedPhoto[],
): FollowupResult {
  const issues = validateFollowup(db, input, roles);
  if (issues.length) return { ok: false, issues };
  const common = makeTxCommon(ctx, randomUUID(), input.correctionOf ?? null);
  const rows = photos.map((p) => photoRowFor(p, ctx));
  return { ok: true, mobileUuid: createFollowup(db, common, input, rows) };
}
