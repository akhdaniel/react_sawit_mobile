/**
 * SPB (Surat Pengantar Buah) dan langsir.
 *
 * - Tiket bisa berasal dari QR (dibuat di HP mandor lain, belum ada di DB lokal) atau
 *   dari tiket lokal; baris SPB hanya menyimpan mobile_uuid tiket.
 * - Satu tiket hanya boleh di satu SPB aktif, kecuali SPB langsir yang meneruskan
 *   tiket dari SPB induknya.
 * - Minimal 2 foto (muatan) per SPB.
 * - Struktur mengikuti SPB ERP: PKS tujuan, sopir karyawan untuk truk sendiri (nama bebas untuk
 *   truk sewa), dan muatan per tiket (janjang + brondolan); janjang yang tidak dimuat = restan.
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { afdeling, block, employee, pks, spb, spbLine, vehicle } from '../schema';
import type { AppDatabase } from '../types';
import { effectiveTickets, transportedTicketUuids } from './harvest';
import { insertPhoto, linkPhoto, type NewPhoto } from './photos';
import { nextDocNo } from './sequence';

export type SpbRow = typeof spb.$inferSelect;
export type NewSpb = typeof spb.$inferInsert;

/** Ringkasan tiket untuk baris SPB (dari QR atau tiket lokal). */
export interface SpbTicket {
  uuid: string;
  ticketNo: string;
  blockCode: string;
  tphCode: string;
  /** Janjang tiket (total). */
  bunches: number;
  estKg: number;
  /** Brondolan tiket; null = tidak diketahui (QR versi lama). */
  looseFruitKg: number | null;
  /** Muatan di SPB ini; default seluruh tiket. */
  loadBunches: number;
  loadLooseKg: number | null;
}

export interface SpbInput {
  workDate: string;
  vehicleId: number;
  driverName: string;
  /** Sopir karyawan (wajib untuk truk sendiri). */
  driverEmployeeId: number | null;
  pksId: number | null;
  destination: 'internal_mill' | 'partner_mill';
  parentSpbUuid: string | null;
  /** Titik muat SPB induk, untuk SPB langsir. */
  transferPoint: string | null;
  tickets: SpbTicket[];
  photoIds: string[];
}

export type SpbErrorCode =
  | 'unknown_vehicle'
  | 'driver_required'
  | 'driver_employee_required'
  | 'pks_required'
  | 'load_invalid'
  | 'no_tickets'
  | 'photos_required'
  | 'duplicate_ticket'
  | 'ticket_already_transported'
  | 'unknown_parent'
  | 'parent_rejected';

export interface SpbIssue {
  code: SpbErrorCode;
  tickets?: string[];
}

/** Tiket → nomor SPB aktif yang memuatnya. */
export function ticketSpbMap(db: AppDatabase): Map<string, { spbUuid: string; spbNo: string }> {
  const rows = db
    .select({ t: spbLine.harvestTicketUuid, u: spb.mobileUuid, no: spb.spbNo })
    .from(spbLine)
    .innerJoin(spb, eq(spb.mobileUuid, spbLine.spbUuid))
    .where(ne(spb.status, 'rejected'))
    .all();
  return new Map(rows.map((r) => [r.t, { spbUuid: r.u, spbNo: r.no }]));
}

export function validateSpb(db: AppDatabase, input: SpbInput): SpbIssue[] {
  const issues: SpbIssue[] = [];
  const v = db.select().from(vehicle).where(eq(vehicle.id, input.vehicleId)).get();
  if (!v) issues.push({ code: 'unknown_vehicle' });
  if (v?.ownership === 'own') {
    const driver = input.driverEmployeeId
      ? db.select().from(employee).where(eq(employee.id, input.driverEmployeeId)).get()
      : undefined;
    if (!driver || driver.role !== 'sopir') issues.push({ code: 'driver_employee_required' });
  } else if (!input.driverName.trim()) {
    issues.push({ code: 'driver_required' });
  }
  if (input.pksId == null && db.select({ id: pks.id }).from(pks).get()) issues.push({ code: 'pks_required' });
  const badLoads = input.tickets.filter(
    (t) =>
      !Number.isInteger(t.loadBunches) ||
      t.loadBunches < 0 ||
      (t.bunches > 0 && t.loadBunches > t.bunches) ||
      (t.loadLooseKg != null && (t.loadLooseKg < 0 || (t.looseFruitKg != null && t.loadLooseKg > t.looseFruitKg))) ||
      (t.loadBunches === 0 && !t.loadLooseKg),
  );
  if (badLoads.length) issues.push({ code: 'load_invalid', tickets: badLoads.map((t) => t.ticketNo) });
  if (input.tickets.length === 0) issues.push({ code: 'no_tickets' });
  if (new Set(input.photoIds).size < 2) issues.push({ code: 'photos_required' });

  const uuids = input.tickets.map((t) => t.uuid);
  const dup = uuids.filter((u, i) => uuids.indexOf(u) !== i);
  if (dup.length) issues.push({ code: 'duplicate_ticket', tickets: [...new Set(dup)] });

  let parentTickets = new Set<string>();
  if (input.parentSpbUuid) {
    const parent = db.select().from(spb).where(eq(spb.mobileUuid, input.parentSpbUuid)).get();
    if (!parent) issues.push({ code: 'unknown_parent' });
    else if (parent.status === 'rejected') issues.push({ code: 'parent_rejected' });
    else {
      parentTickets = new Set(
        db.select({ t: spbLine.harvestTicketUuid }).from(spbLine).where(eq(spbLine.spbUuid, parent.mobileUuid)).all().map((r) => r.t),
      );
    }
  }
  const used = ticketSpbMap(db);
  const taken = input.tickets.filter((t) => used.has(t.uuid) && !parentTickets.has(t.uuid)).map((t) => t.ticketNo);
  if (taken.length) issues.push({ code: 'ticket_already_transported', tickets: taken });
  return issues;
}

/** Kode afdeling untuk nomor SPB: dari blok tiket pertama yang dikenal, lalu fallback. */
export function spbAfdelingCode(db: AppDatabase, tickets: SpbTicket[], fallbackAfdelingIds: number[]): string {
  const codes = tickets.map((t) => t.blockCode);
  if (codes.length) {
    const row = db
      .select({ code: afdeling.code })
      .from(block)
      .innerJoin(afdeling, eq(afdeling.id, block.afdelingId))
      .where(inArray(block.code, codes))
      .get();
    if (row) return row.code;
  }
  if (fallbackAfdelingIds.length) {
    const row = db.select({ code: afdeling.code }).from(afdeling).where(inArray(afdeling.id, fallbackAfdelingIds)).get();
    if (row) return row.code;
  }
  return 'AFD';
}

/** Total muatan: janjang dimuat, estimasi kg sebanding janjang dimuat. */
export function spbTotals(tickets: SpbTicket[]): { totalBunch: number; estKg: number } {
  const loadKg = (t: SpbTicket) => (t.bunches > 0 ? (t.estKg * t.loadBunches) / t.bunches : t.estKg);
  return {
    totalBunch: tickets.reduce((s, t) => s + t.loadBunches, 0),
    estKg: Math.round(tickets.reduce((s, t) => s + loadKg(t), 0) * 100) / 100,
  };
}

export function createSpb(
  db: AppDatabase,
  common: Omit<
    NewSpb,
    | 'workDate'
    | 'spbNo'
    | 'vehicleId'
    | 'driverName'
    | 'driverEmployeeId'
    | 'pksId'
    | 'transferPoint'
    | 'destination'
    | 'parentSpbUuid'
    | 'totalBunch'
    | 'estKg'
    | 'photoIds'
  >,
  input: SpbInput,
  afdelingCode: string,
  deviceShort: string,
  photos: NewPhoto[],
): { mobileUuid: string; spbNo: string } {
  let result!: { mobileUuid: string; spbNo: string };
  db.transaction((tx) => {
    const t = tx as unknown as AppDatabase;
    const spbNo = nextDocNo(t, 'spb', afdelingCode, input.workDate, deviceShort);
    for (const p of photos) insertPhoto(t, p);
    t.insert(spb)
      .values({
        ...common,
        workDate: input.workDate,
        spbNo,
        vehicleId: input.vehicleId,
        driverName: input.driverName.trim(),
        driverEmployeeId: input.driverEmployeeId,
        pksId: input.pksId,
        transferPoint: input.transferPoint?.trim() || null,
        destination: input.destination,
        parentSpbUuid: input.parentSpbUuid,
        ...spbTotals(input.tickets),
        photoIds: input.photoIds,
      })
      .run();
    for (const tk of input.tickets) {
      t.insert(spbLine)
        .values({ spbUuid: common.mobileUuid, harvestTicketUuid: tk.uuid, bunchCount: tk.loadBunches, looseFruitKg: tk.loadLooseKg })
        .run();
    }
    for (const p of photos) linkPhoto(t, p.id, common.mobileUuid);
    result = { mobileUuid: common.mobileUuid, spbNo };
  });
  return result;
}

export function spbsFor(db: AppDatabase, workDate: string): SpbRow[] {
  return db
    .select()
    .from(spb)
    .where(and(eq(spb.workDate, workDate), ne(spb.status, 'rejected')))
    .orderBy(desc(spb.createdTrustedAt))
    .all();
}

export function spbLines(db: AppDatabase, spbUuid: string): string[] {
  return db.select({ t: spbLine.harvestTicketUuid }).from(spbLine).where(eq(spbLine.spbUuid, spbUuid)).all().map((r) => r.t);
}

/** Baris SPB dengan muatannya (null = tiket dimuat utuh, data versi lama). */
export function spbLoadLines(db: AppDatabase, spbUuid: string) {
  return db.select().from(spbLine).where(eq(spbLine.spbUuid, spbUuid)).all();
}

/**
 * Potensi restan: tiket panen efektif pada tanggal tsb yang belum masuk SPB aktif
 * (berdasarkan data di HP ini).
 */
export function potentialRestan(db: AppDatabase, workDate: string) {
  const moved = transportedTicketUuids(db);
  return effectiveTickets(db, workDate).filter((t) => !moved.has(t.mobileUuid));
}

/** Sudah lewat jam batas restan (zona estate)? */
export function isAfterRestanCutoff(trustedMs: number, utcOffsetMinutes: number, cutoff: string): boolean {
  const [h, m] = cutoff.split(':').map(Number) as [number, number];
  const local = new Date(trustedMs + utcOffsetMinutes * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes() >= h * 60 + m;
}
