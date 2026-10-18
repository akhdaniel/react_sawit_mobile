/**
 * Approval asisten: inbox (cache server) + keputusan (transaksi approval_decision).
 */
import { and, asc, eq, ne, notInArray } from 'drizzle-orm';

import { approvalDecision, approvalInbox } from '../schema';
import type { AppDatabase } from '../types';

export type InboxRow = typeof approvalInbox.$inferSelect;
export type NewDecision = typeof approvalDecision.$inferInsert;

export interface InboxItem {
  target_uuid: string;
  target_type: string;
  summary: string;
  flags: string[];
}

/** Ganti isi inbox satu afdeling dengan data server terbaru (atomik). */
export function replaceInbox(db: AppDatabase, afdelingId: number, items: InboxItem[], fetchedAt: string): void {
  db.transaction((tx) => {
    const keep = items.map((i) => i.target_uuid);
    const del = keep.length
      ? and(eq(approvalInbox.afdelingId, afdelingId), notInArray(approvalInbox.targetUuid, keep))
      : eq(approvalInbox.afdelingId, afdelingId);
    tx.delete(approvalInbox).where(del).run();
    for (const i of items) {
      const row = { targetUuid: i.target_uuid, targetType: i.target_type, summary: i.summary, flags: i.flags, afdelingId, fetchedAt };
      tx.insert(approvalInbox).values(row).onConflictDoUpdate({ target: approvalInbox.targetUuid, set: row }).run();
    }
  });
}

/** Item inbox yang belum diputuskan di HP ini (keputusan yang tidak ditolak). */
export function pendingInbox(db: AppDatabase): InboxRow[] {
  const decided = new Set(
    db.select({ t: approvalDecision.targetUuid }).from(approvalDecision).where(ne(approvalDecision.status, 'rejected')).all().map((r) => r.t),
  );
  return db
    .select()
    .from(approvalInbox)
    .orderBy(asc(approvalInbox.afdelingId), asc(approvalInbox.fetchedAt))
    .all()
    .filter((r) => !decided.has(r.targetUuid));
}

export type DecisionKind = 'approve' | 'reject' | 'correct';

export function validateDecision(db: AppDatabase, targetUuid: string, decision: DecisionKind, note: string | null): 'unknown_target' | 'already_decided' | 'note_required' | null {
  if (!db.select({ t: approvalInbox.targetUuid }).from(approvalInbox).where(eq(approvalInbox.targetUuid, targetUuid)).get()) return 'unknown_target';
  if (!pendingInbox(db).some((r) => r.targetUuid === targetUuid)) return 'already_decided';
  if (decision !== 'approve' && !note?.trim()) return 'note_required';
  return null;
}

export function saveDecision(db: AppDatabase, row: NewDecision): void {
  db.insert(approvalDecision).values(row).run();
}
