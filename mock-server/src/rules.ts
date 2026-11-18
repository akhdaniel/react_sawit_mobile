/**
 * Validasi bisnis sisi server (cermin aturan di HP) untuk POST /transactions.
 * Server tetap menjadi penentu akhir: transaksi yang lolos zod bisa saja ditolak di sini.
 */
import { WORK_TYPE_UNITS, type TxItem } from '../../src/sync/contract';
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
      if (p.sub_blok_id != null) {
        const sub = store.getMaster<{ id: number; block_id: number }>('sub_blok', p.sub_blok_id);
        if (!sub) return { ok: false, reason: 'unknown_master_ref', flags };
        if (sub.block_id !== p.block_id) return { ok: false, reason: 'sub_blok_block_mismatch', flags };
      }
      if (!checkedIn(store, p.harvester_employee_id, p.work_date)) return { ok: false, reason: 'no_check_in', flags };
      const expected = (p.ripe + p.unripe + p.rotten) * block.bjr_kg;
      if (Math.abs(expected - p.est_kg) > EST_KG_TOLERANCE) return { ok: false, reason: 'est_kg_mismatch', flags };
      if (!item.meta.correction_of) {
        const dup = store
          .acceptedOfType('harvest_ticket')
          .some(
            (t) =>
              t.payload.tph_id === p.tph_id &&
              (t.payload.sub_blok_id ?? null) === (p.sub_blok_id ?? null) &&
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
      if (!exists(store, 'pks', p.pks_id)) return { ok: false, reason: 'unknown_pks', flags };
      if (p.driver_employee_id != null && store.getMaster<{ id: number; role?: string | null }>('employee', p.driver_employee_id)?.role !== 'sopir') {
        return { ok: false, reason: 'unknown_driver', flags };
      }
      if (p.lines != null) {
        const lineUuids = p.lines.map((l) => l.ticket_uuid);
        const same = new Set(lineUuids).size === lineUuids.length && lineUuids.length === p.harvest_ticket_uuids.length && lineUuids.every((u) => p.harvest_ticket_uuids.includes(u));
        if (!same) return { ok: false, reason: 'spb_lines_mismatch', flags };
        if (p.lines.some((l) => l.bunch_count === 0 && l.loose_fruit_kg === 0)) return { ok: false, reason: 'spb_line_empty', flags };
      }
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
    case 'fertilization_ticket': {
      // Cermin xerpium_sawit_mobile _rule_fertilization_ticket (syarat tiket pemupukan ERP).
      const p = item.payload;
      const block = store.getMaster<Block & { tree_count?: number | null }>('block', p.block_id);
      if (!block) return { ok: false, reason: 'unknown_master_ref', flags };
      const subBloks = store.listMaster<{ id: number; block_id: number }>('sub_blok').filter((s) => s.block_id === p.block_id);
      if (p.sub_blok_id != null) {
        if (!exists(store, 'sub_blok', p.sub_blok_id)) return { ok: false, reason: 'unknown_master_ref', flags };
        if (!subBloks.some((s) => s.id === p.sub_blok_id)) return { ok: false, reason: 'sub_blok_block_mismatch', flags };
      } else if (subBloks.length !== 1) {
        return { ok: false, reason: 'sub_blok_required', flags };
      }
      const g = store.getMaster<Gang & { gang_type?: string | null }>('gang', p.gang_id);
      if (!g) return { ok: false, reason: 'unknown_gang', flags };
      if (g.gang_type !== 'rawat') return { ok: false, reason: 'gang_not_rawat', flags };
      if (!exists(store, 'employee', p.worker_employee_id)) return { ok: false, reason: 'unknown_employee', flags };
      if (!checkedIn(store, p.worker_employee_id, p.work_date)) return { ok: false, reason: 'no_check_in', flags };
      const prod = store.getMaster<{ id: number; is_fertilizer?: boolean | null; fertilizer_group_id?: number | null; dosage_kg_per_tree?: number | null }>(
        'product',
        p.product_id,
      );
      if (!prod?.is_fertilizer) return { ok: false, reason: 'unknown_fertilizer', flags };
      if (prod.fertilizer_group_id == null) return { ok: false, reason: 'fertilizer_without_group', flags };
      if (block.tree_count && p.tree_count > block.tree_count) return { ok: false, reason: 'tree_count_exceeds_block', flags };
      const max = prod.dosage_kg_per_tree ? prod.dosage_kg_per_tree * p.tree_count : null;
      if (max != null && Math.round(p.qty_kg * 100) > Math.round(max * 100)) return { ok: false, reason: 'over_dose', flags };
      return { ok: true, flags };
    }
    case 'maintenance_ticket': {
      // Cermin xerpium_sawit_mobile _rule_maintenance_ticket (syarat tiket perawatan ERP).
      const p = item.payload;
      const block = store.getMaster<Block & { tree_count?: number | null }>('block', p.block_id);
      if (!block) return { ok: false, reason: 'unknown_master_ref', flags };
      const subBloks = store.listMaster<{ id: number; block_id: number }>('sub_blok').filter((s) => s.block_id === p.block_id);
      if (p.sub_blok_id != null) {
        if (!subBloks.some((s) => s.id === p.sub_blok_id)) return { ok: false, reason: 'sub_blok_block_mismatch', flags };
      } else if (subBloks.length !== 1) {
        return { ok: false, reason: 'sub_blok_required', flags };
      }
      const g = store.getMaster<Gang & { gang_type?: string | null }>('gang', p.gang_id);
      if (!g) return { ok: false, reason: 'unknown_gang', flags };
      if (g.gang_type !== 'rawat') return { ok: false, reason: 'gang_not_rawat', flags };
      if (!exists(store, 'employee', p.worker_employee_id)) return { ok: false, reason: 'unknown_employee', flags };
      if (!checkedIn(store, p.worker_employee_id, p.work_date)) return { ok: false, reason: 'no_check_in', flags };
      const qty = { ha: p.area_ha, tree: p.tree_count, hk: p.hk }[WORK_TYPE_UNITS[p.work_type]];
      if (!(qty > 0)) return { ok: false, reason: 'invalid_work_qty', flags };
      if (block.ha && Math.round(p.area_ha * 100) > Math.round(block.ha * 100)) return { ok: false, reason: 'area_exceeds_block', flags };
      if (block.tree_count && p.tree_count > block.tree_count) return { ok: false, reason: 'tree_count_exceeds_block', flags };
      const ids = p.materials.map((m) => m.product_id);
      if (new Set(ids).size !== ids.length) return { ok: false, reason: 'duplicate_material', flags };
      for (const m of p.materials) {
        const prod = store.getMaster<{ id: number; dosage_per_ha?: number | null }>('product', m.product_id);
        if (!prod) return { ok: false, reason: 'unknown_product', flags };
        if (prod.dosage_per_ha && !p.area_ha) return { ok: false, reason: 'area_required_for_dosage', flags };
        if (prod.dosage_per_ha && Math.round(m.qty * 1000) > Math.round(prod.dosage_per_ha * p.area_ha * 1000)) {
          return { ok: false, reason: 'over_dose', flags };
        }
      }
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
    case 'stage_confirm': {
      // Mock tidak punya tahap ERP: Lanjutkan cukup merujuk tiket yang dikenal (server_id tiket = tiket ERP).
      const p = item.payload;
      const target = p.target_uuid
        ? store.transactions.get(p.target_uuid)
        : [...store.transactions.values()].find((t) => t.item.type === p.target_type && t.serverId === p.core_ticket_id);
      if (!target) return { ok: false, reason: 'target_not_found', flags };
      if (target.item.type !== p.target_type) return { ok: false, reason: 'target_type_mismatch', flags };
      if (target.status === 'rejected') return { ok: false, reason: 'target_rejected', flags };
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
    case 'fertilization_ticket':
      return `Pemupukan blok #${item.payload.block_id} pekerja #${item.payload.worker_employee_id}: ${item.payload.tree_count} pokok, ${item.payload.qty_kg} kg`;
    case 'maintenance_ticket':
      return `Perawatan ${item.payload.work_type} blok #${item.payload.block_id} pekerja #${item.payload.worker_employee_id}: ${item.payload.area_ha} ha, ${item.payload.tree_count} pokok, ${item.payload.hk} HK, ${item.payload.materials.length} material`;
    case 'upkeep':
      return `Perawatan blok #${item.payload.block_id}, ${item.payload.hk} HK`;
    case 'material_usage':
      return `Material #${item.payload.product_id}: ${item.payload.qty} ${item.payload.uom}`;
    case 'daily_report':
      return `Laporan harian gang #${item.payload.gang_id} ${item.payload.date}`;
    case 'approval_decision':
      return `Keputusan ${item.payload.decision} untuk ${item.payload.target_uuid}`;
    case 'stage_confirm':
      return `Lanjutkan tiket ${item.payload.target_uuid ?? `#${item.payload.core_ticket_id}`}`;
  }
}
