import { randomUUID } from 'expo-crypto';

import { saveAssignment, validateAssignment, type AssignmentInput, type AssignmentIssue } from '@/db/repositories/assignment';
import type { AppDatabase } from '@/db/types';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';

export type AssignmentResult = { ok: true; mobileUuid: string } | { ok: false; issues: AssignmentIssue[] };

export function createAssignment(db: AppDatabase, ctx: TxContext, input: AssignmentInput): AssignmentResult {
  const issues = validateAssignment(db, input);
  if (issues.length) return { ok: false, issues };
  const mobileUuid = randomUUID();
  saveAssignment(db, {
    ...makeTxCommon(ctx, mobileUuid),
    workDate: input.workDate,
    workPlanId: input.workPlanId,
    unplannedReason: input.workPlanId == null ? (input.unplannedReason?.trim() ?? null) : null,
    activityId: input.activityId,
    blockId: input.blockId,
    employeeIds: [...new Set(input.employeeIds)],
  });
  return { ok: true, mobileUuid };
}
