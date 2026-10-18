/**
 * Validasi bisnis sisi server (cermin aturan di HP) untuk POST /transactions.
 * Server tetap menjadi penentu akhir: transaksi yang lolos zod bisa saja ditolak di sini.
 */
import type { TxItem } from '../../src/sync/contract';
import type { Store } from './store';

type Block = { id: number; afdeling_id: number; bjr_kg: number; ha: number };
type Gang = { id: number; afdeling_id: number };

export interface RuleResult {
  ok: boolean;
  reason?: string;
  /** Penanda untuk antrean approval asisten (tidak menolak transaksi). */
  flags: string[];
}

const EST_KG_TOLERANCE = 0.5;

function exists(store: Store, entity: Parameters<Store['getMaster']>[0], id: number | null | undefined) {
  return id == null || store.getMaster(entity, id) != null;
}

/** Absensi efektif (koreksi menggantikan baris asal) — sama dengan aturan di HP. */
function effectiveCheckIns(store: Store, date: string) {
  const rows = store.acceptedOfType('attendance').filter((a) => a.payload.work_date === date && a.payload.type === 'check_in');
  const superseded = new Set(rows.map((r) => r.meta.correction_of).filter(Boolean));
  return rows.filter((r) => !superseded.has(r.mobile_uuid));
}

/** Hadir = check-in efektif berstatus hadir/terlambat (sakit/izin/mangkir tidak dihitung). */
function checkedIn(store: Store, employeeId: number, date: string): boolean {
  return effectiveCheckIns(store, date).some(
    (a) => a.payload.employee_id === employeeId && (a.payload.att_status === 'hadir' || a.payload.att_status === 'terlambat'),
  );
}

export function evaluate(store: Store, item: TxItem, userId: number): RuleResult {
  const flags: string[] = [];
  if (item.meta.user_id !== userId) return { ok: false, reason: 'user_mismatch', flags };
  if (item.meta.mocked) flags.push('mocked_gps');
  if (item.meta.rooted) flags.push('rooted_device');
  if (item.meta.time_source === 'device') flags.push('untrusted_time');
  if (item.meta.correction_of) {
    if (!store.transactions.has(item.meta.correction_of)) return { ok: false, reason: 'correction_target_not_found', flags };
    flags.push('correction');
  }

  switch (item.type) {
    case 'attendance': {
      const p = item.payload;
      if (!exists(store, 'employee', p.employee_id)) return { ok: false, reason: 'unknown_employee', flags };
      if (!exists(store, 'gang', p.gang_id)) return { ok: false, reason: 'unknown_gang', flags };
      if (p.type === 'check_in' && !item.meta.correction_of) {
        const existing = effectiveCheckIns(store, p.work_date).find((a) => a.payload.employee_id === p.employee_id);
        if (existing) {
          return { ok: false, reason: existing.payload.gang_id === p.gang_id ? 'already_checked_in' : 'already_checked_in_other_gang', flags };
        }
      }
      if (p.type === 'check_out' && !checkedIn(store, p.employee_id, p.work_date)) {
        return { ok: false, reason: 'not_checked_in', flags };
      }
      if (p.outside_afdeling) flags.push('outside_afdeling');
      return { ok: true, flags };
    }
    case 'assignment': {
      const p = item.payload;
      if (!exists(store, 'block', p.block_id) || !exists(store, 'activity', p.activity_id)) {
        return { ok: false, reason: 'unknown_master_ref', flags };
      }
      const missing = p.employee_ids.filter((e) => !checkedIn(store, e, p.work_date));
      if (missing.length) return { ok: false, reason: `no_check_in:${missing.join(',')}`, flags };
      if (p.work_plan_id == null) flags.push('unplanned');
      return { ok: true, flags };
    }
    case 'harvest_ticket': {
      const p = item.payload;
      const block = store.getMaster<Block & { id: number }>('block', p.block_id);
      if (!block || !exists(store, 'tph', p.tph_id)) return { ok: false, reason: 'unknown_master_ref', flags };
      if (!checkedIn(store, p.harvester_employee_id, p.work_date)) return { ok: false, reason: 'no_check_in', flags };
      const expected = (p.ripe + p.unripe + p.rotten) * block.bjr_kg;
      if (Math.abs(expected - p.est_kg) > EST_KG_TOLERANCE) return { ok: false, reason: 'est_kg_mismatch', flags };
      if (!item.meta.correction_of) {
        const dup = store
          .acceptedOfType('harvest_ticket')
          .some(
            (t) =>
              t.payload.tph_id === p.tph_id &&
              t.payload.harvester_employee_id === p.harvester_employee_id &&
              t.payload.work_date === p.work_date &&
              !t.meta.correction_of,
          );
        if (dup && !p.is_late_entry) return { ok: false, reason: 'second_ticket_must_be_late_entry', flags };
      }
      if (p.is_late_entry) flags.push('late_entry');
      if (p.unripe > 0) flags.push('unripe_bunch');
      return { ok: true, flags };
    }
    case 'spb': {
      const p = item.payload;
      if (!exists(store, 'vehicle', p.vehicle_id)) return { ok: false, reason: 'unknown_vehicle', flags };
      if (p.parent_spb_uuid && !store.transactions.has(p.parent_spb_uuid)) {
        return { ok: false, reason: 'parent_spb_not_found', flags };
      }
      // Tiket bisa dibuat di HP mandor yang belum sinkron → terima dengan flag (rekonsiliasi server).
      const rejected = p.harvest_ticket_uuids.filter((u) => store.transactions.get(u)?.status === 'rejected');
      if (rejected.length) return { ok: false, reason: 'harvest_ticket_rejected', flags };
      if (p.harvest_ticket_uuids.some((u) => !store.transactions.has(u))) flags.push('unsynced_ticket');
      // Satu tiket hanya di satu SPB, kecuali langsir yang meneruskan tiket dari SPB induk.
      const parentTickets = new Set(
        p.parent_spb_uuid ? (store.acceptedOfType('spb').find((x) => x.mobile_uuid === p.parent_spb_uuid)?.payload.harvest_ticket_uuids ?? []) : [],
      );
      const used = new Set(store.acceptedOfType('spb').flatMap((x) => x.payload.harvest_ticket_uuids));
      if (p.harvest_ticket_uuids.some((u) => used.has(u) && !parentTickets.has(u))) {
        return { ok: false, reason: 'ticket_already_transported', flags };
      }
      if (p.destination === 'partner_mill') flags.push('partner_mill');
      return { ok: true, flags };
    }
    case 'upkeep': {
      const p = item.payload;
      if (!exists(store, 'block', p.block_id) || !exists(store, 'activity', p.activity_id)) {
        return { ok: false, reason: 'unknown_master_ref', flags };
      }
      const missing = p.employee_ids.filter((e) => !checkedIn(store, e, p.work_date));
      if (missing.length) return { ok: false, reason: `no_check_in:${missing.join(',')}`, flags };
      return { ok: true, flags };
    }
    case 'material_usage': {
      const p = item.payload;
      const upkeep = store.transactions.get(p.upkeep_uuid);
      if (!upkeep || upkeep.status !== 'accepted' || upkeep.item.type !== 'upkeep') {
        return { ok: false, reason: 'upkeep_not_accepted', flags };
      }
      if (!exists(store, 'product', p.product_id)) return { ok: false, reason: 'unknown_product', flags };
      // Hitung ulang batas dosis di server: over-dose yang tidak ditandai HP ditolak.
      const up = upkeep.item.payload as { activity_id: number; realized_ha: number | null };
      const rule = store
        .listMaster<{ id: number; activity_id: number; product_id: number; dose_per_ha: number; tolerance_pct: number }>('dosage_rule')
        .find((r) => r.activity_id === up.activity_id && r.product_id === p.product_id);
      if (rule && up.realized_ha && p.qty > rule.dose_per_ha * up.realized_ha * (1 + rule.tolerance_pct / 100) + 1e-9 && !p.over_dose) {
        return { ok: false, reason: 'over_dose_unflagged', flags };
      }
      if (p.over_dose) flags.push('over_dose');
      return { ok: true, flags };
    }
    case 'daily_report': {
      if (!exists(store, 'gang', item.payload.gang_id)) return { ok: false, reason: 'unknown_gang', flags };
      return { ok: true, flags };
    }
    case 'approval_decision': {
      if (!store.transactions.has(item.payload.target_uuid)) return { ok: false, reason: 'target_not_found', flags };
      return { ok: true, flags };
    }
  }
}

/** Afdeling pemilik transaksi (untuk filter GET /approvals). */
export function afdelingOf(store: Store, item: TxItem): number | null {
  const p = item.payload as Record<string, unknown>;
  if (typeof p.block_id === 'number') return store.getMaster<Block>('block', p.block_id)?.afdeling_id ?? null;
  if (typeof p.gang_id === 'number') return store.getMaster<Gang>('gang', p.gang_id)?.afdeling_id ?? null;
  if (item.type === 'material_usage') {
    const up = store.transactions.get(item.payload.upkeep_uuid);
    return up ? afdelingOf(store, up.item) : null;
  }
  return null;
}

export function summarize(item: TxItem): string {
  switch (item.type) {
    case 'attendance':
      return `Absen ${item.payload.type} pekerja #${item.payload.employee_id} (${item.payload.att_status})`;
    case 'assignment':
      return `Penugasan blok #${item.payload.block_id}, ${item.payload.employee_ids.length} pekerja`;
    case 'harvest_ticket':
      return `Tiket ${item.payload.ticket_no}: ${item.payload.ripe + item.payload.unripe + item.payload.rotten} janjang, ${item.payload.est_kg} kg`;
    case 'spb':
      return `SPB ${item.payload.spb_no}: ${item.payload.total_bunch} janjang`;
    case 'upkeep':
      return `Perawatan blok #${item.payload.block_id}, ${item.payload.hk} HK`;
    case 'material_usage':
      return `Material #${item.payload.product_id}: ${item.payload.qty} ${item.payload.uom}`;
    case 'daily_report':
      return `Laporan harian gang #${item.payload.gang_id} ${item.payload.date}`;
    case 'approval_decision':
      return `Keputusan ${item.payload.decision} untuk ${item.payload.target_uuid}`;
  }
}
