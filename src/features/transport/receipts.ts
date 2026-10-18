/** Struk ESC/POS 58 mm untuk SPB dan tiket panen. */
import { EscPos } from '../../lib/escpos';

export interface SpbReceipt {
  spbNo: string;
  workDate: string;
  createdAt: string;
  vehiclePlate: string;
  driverName: string;
  destination: string;
  parentSpbNo: string | null;
  tickets: { ticketNo: string; blockCode: string; bunches: number; estKg: number }[];
  totalBunch: number;
  estKg: number;
  clerkName: string;
  qr: string;
}

export function buildSpbReceipt(r: SpbReceipt): Uint8Array {
  const p = new EscPos().init().align('center').bold(true).doubleSize(true).line('SPB').doubleSize(false).line(r.spbNo).bold(false);
  p.line(r.createdAt).align('left').divider();
  p.row('Tanggal', r.workDate).row('Kendaraan', r.vehiclePlate).row('Sopir', r.driverName).row('Tujuan', r.destination);
  if (r.parentSpbNo) p.line('Langsir dari:').line(`  ${r.parentSpbNo}`);
  p.divider().bold(true).row('Tiket', 'Jjg / Kg').bold(false);
  for (const t of r.tickets) p.row(`${t.ticketNo.slice(-9)} ${t.blockCode}`, `${t.bunches} / ${Math.round(t.estKg)}`);
  p.divider().bold(true).row('TOTAL JANJANG', String(r.totalBunch)).row('ESTIMASI KG', String(Math.round(r.estKg))).bold(false);
  p.divider().row('Kerani', r.clerkName).feed(1).align('center').qr(r.qr, 5).feed(1).line('Xerpium Sawit').feed(3).cut();
  return p.build();
}

export interface TicketReceipt {
  ticketNo: string;
  workDate: string;
  blockCode: string;
  tphCode: string;
  harvesterName: string;
  ripe: number;
  unripe: number;
  rotten: number;
  looseFruitKg: number;
  estKg: number;
  lateEntry: boolean;
  qr: string;
}

export function buildTicketReceipt(r: TicketReceipt): Uint8Array {
  const p = new EscPos().init().align('center').bold(true).line('TIKET PANEN').line(r.ticketNo).bold(false);
  if (r.lateEntry) p.bold(true).line('** SUSULAN **').bold(false);
  p.align('left').divider();
  p.row('Tanggal', r.workDate).row('Blok / TPH', `${r.blockCode} / ${r.tphCode}`).wrapped(`Pemanen: ${r.harvesterName}`);
  p.divider().row('Matang', String(r.ripe)).row('Mentah', String(r.unripe)).row('Busuk', String(r.rotten)).row('Brondolan (kg)', String(r.looseFruitKg));
  p.bold(true).row('ESTIMASI KG', String(r.estKg)).bold(false).feed(1).align('center').qr(r.qr, 6).feed(3).cut();
  return p.build();
}
