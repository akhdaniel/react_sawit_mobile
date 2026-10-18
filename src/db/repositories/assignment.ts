/**
 * Penugasan kerja harian: berdasarkan rencana kerja (work_plan) atau di luar rencana
 * (wajib alasan). Pekerja yang belum check-in hadir hari itu tidak bisa ditugaskan.
 */
import { and, asc, desc, eq, ne } from 'drizzle-orm';

import { activity, assignment, block, workPlan } from '../schema';
import type { AppDatabase } from '../types';
import { presentEmployeeIds } from './attendance';

export type AssignmentRow = typeof assignment.$inferSelect;
export type NewAssignment = typeof assignment.$inferInsert;
export type WorkPlanRow = typeof workPlan.$inferSelect;

export function workPlansFor(db: AppDatabase, workDate: string, gangId?: number): WorkPlanRow[] {
  const conds = [eq(workPlan.date, workDate)];
  if (gangId != null) conds.push(eq(workPlan.gangId, gangId));
  return db.select().from(workPlan).where(and(...conds)).orderBy(asc(workPlan.id)).all();
}

export function assignmentsFor(db: AppDatabase, workDate: string): AssignmentRow[] {
  return db
    .select()
    .from(assignment)
    .where(and(eq(assignment.workDate, workDate), ne(assignment.status, 'rejected')))
    .orderBy(desc(assignment.createdTrustedAt))
    .all();
}

export type AssignmentErrorCode =
  | 'no_employees'
  | 'not_checked_in'
  | 'unknown_activity'
  | 'unknown_block'
  | 'unknown_work_plan'
  | 'work_plan_other_date'
  | 'unplanned_reason_required';

export interface AssignmentIssue {
  code: AssignmentErrorCode;
  employeeIds?: number[];
}

export interface AssignmentInput {
  workDate: string;
  workPlanId: number | null;
  unplannedReason: string | null;
  activityId: number;
  blockId: number;
  employeeIds: number[];
}

export function validateAssignment(db: AppDatabase, input: AssignmentInput): AssignmentIssue[] {
  const issues: AssignmentIssue[] = [];
  if (input.employeeIds.length === 0) issues.push({ code: 'no_employees' });
  const present = presentEmployeeIds(db, input.workDate);
  const missing = input.employeeIds.filter((id) => !present.has(id));
  if (missing.length) issues.push({ code: 'not_checked_in', employeeIds: missing });
  if (!db.select({ id: activity.id }).from(activity).where(eq(activity.id, input.activityId)).get()) issues.push({ code: 'unknown_activity' });
  if (!db.select({ id: block.id }).from(block).where(eq(block.id, input.blockId)).get()) issues.push({ code: 'unknown_block' });
  if (input.workPlanId != null) {
    const plan = db.select().from(workPlan).where(eq(workPlan.id, input.workPlanId)).get();
    if (!plan) issues.push({ code: 'unknown_work_plan' });
    else if (plan.date !== input.workDate) issues.push({ code: 'work_plan_other_date' });
  } else if (!input.unplannedReason?.trim()) {
    issues.push({ code: 'unplanned_reason_required' });
  }
  return issues;
}

export function saveAssignment(db: AppDatabase, row: NewAssignment): void {
  db.insert(assignment).values(row).run();
}
