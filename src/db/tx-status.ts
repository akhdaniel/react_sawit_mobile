/**
 * Siklus status transaksi: draft → queued → sent → accepted | rejected(reason) → posted.
 *
 * - draft/queued: masih lokal, kolom bisnis boleh diubah (queued boleh kembali ke draft).
 * - sent → queued: hanya untuk kirim ulang setelah gagal jaringan (aman karena idempoten).
 * - rejected dan posted adalah status akhir.
 *
 * Peta ini juga menjadi sumber trigger SQLite (scripts/gen-guard-triggers.ts).
 */
export const TX_STATUSES = ['draft', 'queued', 'sent', 'accepted', 'rejected', 'posted'] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

export const TX_TRANSITIONS: Readonly<Record<TxStatus, readonly TxStatus[]>> = {
  draft: ['queued'],
  queued: ['draft', 'sent', 'accepted', 'rejected'],
  sent: ['queued', 'accepted', 'rejected', 'posted'],
  accepted: ['posted', 'rejected'],
  rejected: [],
  posted: [],
};

/**
 * Status yang sudah disimpan pengguna tetapi belum dikonfirmasi server —
 * dihitung sebagai "X data belum terkirim". Draf tidak dihitung karena belum disimpan final.
 */
export const PENDING_STATUSES: readonly TxStatus[] = ['queued', 'sent'];

/** Status di mana kolom bisnis masih boleh diubah. */
export const MUTABLE_STATUSES: readonly TxStatus[] = ['draft', 'queued'];

export function canTransition(from: TxStatus, to: TxStatus): boolean {
  return from === to || TX_TRANSITIONS[from].includes(to);
}

export function isMutable(status: TxStatus): boolean {
  return MUTABLE_STATUSES.includes(status);
}
