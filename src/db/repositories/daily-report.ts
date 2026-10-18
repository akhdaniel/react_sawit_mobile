/**
 * Laporan harian mandor/asisten per gang: ringkasan dihitung dari data lokal
 * (absensi, penugasan, panen, perawatan) lalu ditandatangani.
 * Laporan ulang untuk tanggal+gang yang sama = koreksi (correction_of laporan sebelumnya).
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { assignment, dailyReport, materialUsage, upkeep } from '../schema';
import type { AppDatabase } from '../types';
import { attendanceByEmployee } from './attendance';
import { effectiveTickets, transportedTicketUuids } from './harvest';
import { insertPhoto, linkPhoto, type NewPhoto } from './photos';

export type DailyReportRow = typeof dailyReport.$inferSelect;
export type NewDailyReport = typeof dailyReport.$inferInsert;

export interface DailySummary {
  date: string;
  gangId: number;
  attendance: { hadir: number; terlambat: number; sakit: number; izin: number; mangkir: number; pulang: number };
  assignments: number;
  harvest: { tickets: number; bunches: number; estKg: number; lateEntries: number; notTransported: number };
  upkeep: { jobs: number; hk: number; ha: number; overDose: number };
}

export function buildDailySummary(db: AppDatabase, date: string, gangId: number): DailySummary {
  const att = { hadir: 0, terlambat: 0, sakit: 0, izin: 0, mangkir: 0, pulang: 0 };
  const gangEmployees = new Set<number>();
  for (const [id, d] of attendanceByEmployee(db, date)) {
    if (d.checkIn?.gangId !== gangId) continue;
    gangEmployees.add(id);
    att[d.checkIn.attStatus]++;
    if (d.checkOut) att.pulang++;
  }

  const assignments = db
    .select()
    .from(assignment)
    .where(and(eq(assignment.workDate, date), ne(assignment.status, 'rejected')))
    .all()
    .filter((a) => a.employeeIds.some((e) => gangEmployees.has(e))).length;

  const moved = transportedTicketUuids(db);
  const tickets = effectiveTickets(db, date).filter((t) => gangEmployees.has(t.harvesterEmployeeId));
  const harvest = {
    tickets: tickets.length,
    bunches: tickets.reduce((s, t) => s + t.ripe + t.unripe + t.rotten, 0),
    estKg: Math.round(tickets.reduce((s, t) => s + t.estKg, 0) * 100) / 100,
    lateEntries: tickets.filter((t) => t.isLateEntry).length,
    notTransported: tickets.filter((t) => !moved.has(t.mobileUuid)).length,
  };

  const jobs = db
    .select()
    .from(upkeep)
    .where(and(eq(upkeep.workDate, date), ne(upkeep.status, 'rejected')))
    .all()
    .filter((u) => u.employeeIds.some((e) => gangEmployees.has(e)));
  const overDose = jobs.length
    ? db.select().from(materialUsage).where(and(inArray(materialUsage.upkeepUuid, jobs.map((j) => j.mobileUuid)), eq(materialUsage.overDose, true))).all().length
    : 0;
  return {
    date,
    gangId,
    attendance: att,
    assignments,
    harvest,
    upkeep: { jobs: jobs.length, hk: jobs.reduce((s, j) => s + j.hk, 0), ha: jobs.reduce((s, j) => s + (j.realizedHa ?? 0), 0), overDose },
  };
}

/** Laporan efektif terakhir untuk tanggal+gang (untuk dijadikan correction_of). */
export function latestReport(db: AppDatabase, date: string, gangId: number): DailyReportRow | null {
  const rows = db
    .select()
    .from(dailyReport)
    .where(and(eq(dailyReport.date, date), eq(dailyReport.gangId, gangId), ne(dailyReport.status, 'rejected')))
    .orderBy(desc(dailyReport.createdTrustedAt))
    .all();
  const superseded = new Set(rows.map((r) => r.correctionOf).filter(Boolean));
  return rows.find((r) => !superseded.has(r.mobileUuid)) ?? null;
}

export function reportsFor(db: AppDatabase, date: string): DailyReportRow[] {
  return db.select().from(dailyReport).where(and(eq(dailyReport.date, date), ne(dailyReport.status, 'rejected'))).orderBy(desc(dailyReport.createdTrustedAt)).all();
}

export function saveDailyReport(db: AppDatabase, row: NewDailyReport, signature?: NewPhoto): void {
  db.transaction((tx) => {
    const t = tx as unknown as AppDatabase;
    if (signature) insertPhoto(t, signature);
    t.insert(dailyReport).values({ ...row, signaturePngId: signature?.id ?? null }).run();
    if (signature) linkPhoto(t, signature.id, row.mobileUuid);
  });
}

