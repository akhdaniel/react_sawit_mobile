/**
 * Lanjutkan tiket kerja rawat (pemupukan, perawatan) dari detail tiket: tombol untuk mandor/kerani rawat dan status
 * Lanjutkan terakhir. Tiket panen memakai versi sendiri di layar tiket panen.
 */
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/Button';
import { StatusPill } from '@/components/StatusPill';
import { useTableQuery } from '@/db/provider';
import { getDocument } from '@/db/repositories/documents';
import { latestConfirmFor, validateContinueTicket } from '@/db/repositories/verification';
import { useSession } from '@/features/auth/session-store';
import { reasonLabel } from '@/features/common/reason';
import { continueTicket } from '@/features/harvest/stage';
import { t } from '@/i18n/id';
import { useServices } from '@/lib/services';
import type { StageTargetType } from '@/sync/contract';

type RawatTarget = Exclude<StageTargetType, 'harvest_ticket'>;

/** User ini memverifikasi tiket kerja rawat (mandor rawat atau kerani rawat). */
export function useRawatVerifier(): boolean {
  return useSession((s) => !!s.user?.roles.some((r) => r === 'mandor_rawat' || r === 'kerani_rawat'));
}

/** Status Lanjutkan terakhir untuk tiket HP `ticketUuid` (kosong bila belum pernah dilanjutkan). */
export function ContinuePill({ ticketUuid }: { ticketUuid: string }) {
  const { db } = useServices();
  const confirm = useTableQuery(['stage_confirm', ticketUuid], () => latestConfirmFor(db, ticketUuid));
  if (!confirm) return null;
  return (
    <StatusPill
      label={t(`harvest.continueState.${confirm.status === 'draft' ? 'queued' : confirm.status}`, { reason: reasonLabel(confirm.rejectReason) })}
      tone={confirm.status === 'rejected' ? 'danger' : confirm.status === 'posted' ? 'success' : 'warning'}
    />
  );
}

/** Tombol Lanjutkan, hanya tampil bila user ini verifikator rawat dan tiket masih bisa dilanjutkan. */
export function ContinueButton({ type, ticketUuid }: { type: RawatTarget; ticketUuid: string }) {
  const services = useServices();
  const { db } = services;
  const verifier = useRawatVerifier();
  const userId = useSession((s) => s.user?.id ?? 0);
  const canContinue = useTableQuery(['stage_confirm', type, ticketUuid, `user:${userId}`], () =>
    validateContinueTicket(db, ticketUuid, userId, type) === null,
  );
  const [busy, setBusy] = useState(false);
  if (!verifier || !canContinue) return null;

  const run = async () => {
    setBusy(true);
    try {
      const r = continueTicket(db, await services.txContext(), ticketUuid, type);
      Alert.alert(t('harvest.continue'), r.ok ? t('harvest.continueSaved') : t(`harvest.continueError.${r.code}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      icon="check-decagram"
      label={t('harvest.continue')}
      busy={busy}
      onPress={() =>
        Alert.alert(t('harvest.continueTitle'), t('harvest.continueConfirm'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('harvest.continue'), onPress: () => void run() },
        ])
      }
    />
  );
}

const VERIFIED_STATES = ['verified', 'closed'];

/** Tiket ERP sudah Terverifikasi/Ditutup: pupuk/material keluar gudang, koreksi dari HP ditolak server. */
export function useDocumentVerified(ticketUuid: string): boolean {
  const { db } = useServices();
  return useTableQuery(['tx_document', ticketUuid], () => VERIFIED_STATES.includes(getDocument(db, ticketUuid)?.state ?? ''));
}
