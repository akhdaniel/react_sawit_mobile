import { randomUUID } from 'expo-crypto';
import { eq } from 'drizzle-orm';

import { saveDecision, validateDecision, type DecisionKind } from '@/db/repositories/approval';
import { buildDailySummary, latestReport, saveDailyReport } from '@/db/repositories/daily-report';
import { approvalInbox } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { makeTxCommon, type TxContext } from '@/features/common/tx-factory';

export type DecisionResult = { ok: true } | { ok: false; code: NonNullable<ReturnType<typeof validateDecision>> };

/** Keputusan asisten atas item inbox → transaksi approval_decision (dikirim saat sinkron). */
export function decide(db: AppDatabase, ctx: TxContext, targetUuid: string, decision: DecisionKind, note: string | null): DecisionResult {
  const code = validateDecision(db, targetUuid, decision, note);
  if (code) return { ok: false, code };
  const item = db.select().from(approvalInbox).where(eq(approvalInbox.targetUuid, targetUuid)).get()!;
  saveDecision(db, {
    ...makeTxCommon(ctx, randomUUID()),
    targetUuid,
    targetType: item.targetType,
    decision,
    note: note?.trim() || null,
    correctedJson: decision === 'correct' ? { instruction: note?.trim() ?? '' } : null,
  });
  return { ok: true };
}

export interface SignatureFile {
  id: string;
  localUri: string;
  sizeBytes: number;
  sha256: string;
}

/** Simpan laporan harian bertanda tangan; laporan ulang = koreksi laporan sebelumnya. */
export function submitDailyReport(db: AppDatabase, ctx: TxContext, date: string, gangId: number, signature: SignatureFile): { mobileUuid: string; corrected: boolean } {
  const previous = latestReport(db, date, gangId);
  const mobileUuid = randomUUID();
  saveDailyReport(
    db,
    {
      ...makeTxCommon(ctx, mobileUuid, previous?.mobileUuid ?? null),
      date,
      gangId,
      summaryJson: buildDailySummary(db, date, gangId) as unknown as Record<string, unknown>,
    },
    {
      id: signature.id,
      localUri: signature.localUri,
      sha256: signature.sha256,
      sizeBytes: signature.sizeBytes,
      takenTrustedAt: ctx.trusted.iso,
      lat: ctx.fix?.lat ?? null,
      lng: ctx.fix?.lng ?? null,
      accuracyM: ctx.fix?.accuracyM ?? null,
      mocked: ctx.fix?.mocked ?? false,
    },
  );
  return { mobileUuid, corrected: !!previous };
}
