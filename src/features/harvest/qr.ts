/**
 * QR tiket panen — dipindai kerani transport (perangkat lain, offline) untuk menyusun SPB.
 * Memuat data secukupnya karena tiket belum tentu ada di DB perangkat pemindai.
 * Format: XSM1|HT|<uuid>|<ticket_no>|<block_code>|<tph_code>|<janjang>|<est_kg>|<work_date>
 */
import { z } from 'zod';

import { DOC_NO_REGEX } from '../../sync/contract';

export const TICKET_QR_PREFIX = 'XSM1|HT|';

export const ticketQrSchema = z.object({
  uuid: z.uuid(),
  ticketNo: z.string().regex(DOC_NO_REGEX),
  blockCode: z.string().min(1),
  tphCode: z.string().min(1),
  bunches: z.int().nonnegative(),
  estKg: z.number().nonnegative(),
  workDate: z.iso.date(),
});

export type TicketQr = z.infer<typeof ticketQrSchema>;

const clean = (s: string) => s.replaceAll('|', '/');

export function encodeTicketQr(t: TicketQr): string {
  return (
    TICKET_QR_PREFIX +
    [t.uuid, t.ticketNo, clean(t.blockCode), clean(t.tphCode), t.bunches, t.estKg, t.workDate].join('|')
  );
}

export function parseTicketQr(raw: string): TicketQr | null {
  if (!raw.startsWith(TICKET_QR_PREFIX)) return null;
  const parts = raw.slice(TICKET_QR_PREFIX.length).split('|');
  if (parts.length !== 7) return null;
  const [uuid, ticketNo, blockCode, tphCode, bunches, kg, workDate] = parts as [string, string, string, string, string, string, string];
  const parsed = ticketQrSchema.safeParse({
    uuid,
    ticketNo,
    blockCode,
    tphCode,
    bunches: Number(bunches),
    estKg: Number(kg),
    workDate,
  });
  return parsed.success ? parsed.data : null;
}
