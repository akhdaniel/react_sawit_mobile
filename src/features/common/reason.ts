/** Alasan penolakan dari server → teks untuk pengguna. Kode singkat diterjemahkan; pesan lain tampil apa adanya. */
import { t } from '../../i18n/id';

const CODE = /^[a-z_]+$/;

export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  // Pesan bebas dari server (mis. "… tidak bisa diverifikasi.") bukan key terjemahan.
  if (!CODE.test(reason)) return reason;
  const key = `reason.${reason}`;
  const label = t(key as never);
  return label === key ? reason : label;
}
