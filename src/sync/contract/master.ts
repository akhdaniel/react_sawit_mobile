/**
 * Skema zod master data sesuai kontrak GET /xsm/v1/master (snake_case, seperti di API).
 * Dipakai oleh sync engine (validasi respons) dan mock-server (bentuk data dummy).
 * Modul ini hanya bergantung pada zod agar bisa diimpor dari Node.
 */
import { z } from 'zod';

const id = z.int().positive();
/** GeoJSON boleh dikirim sebagai objek atau string; disimpan lokal sebagai string. */
const geojson = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .nullish()
  .transform((v) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v)));

export const estateSchema = z.object({ id, code: z.string().min(1), name: z.string().min(1) });

export const afdelingSchema = z.object({
  id,
  code: z.string().regex(/^[A-Z0-9]+$/, 'kode afdeling hanya huruf besar/angka'),
  name: z.string().min(1),
  estate_id: id,
  polygon_geojson: geojson,
});

export const blockSchema = z.object({
  id,
  code: z.string().min(1),
  afdeling_id: id,
  ha: z.number().nonnegative(),
  planting_year: z.int().nullish(),
  status: z.enum(['TM', 'TBM']),
  bjr_kg: z.number().nonnegative(),
  polygon_geojson: geojson,
});

export const tphSchema = z.object({
  id,
  code: z.string().min(1),
  block_id: id,
  lat: z.number().nullish(),
  lng: z.number().nullish(),
});

export const employeeSchema = z.object({
  id,
  nik: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['SKU', 'BHL', 'BORONGAN']),
  gang_id: id.nullish(),
  active: z.boolean(),
  nfc_uid: z
    .string()
    .regex(/^[0-9A-Fa-f]{8,20}$/)
    .nullish()
    .transform((v) => (v == null ? null : v.toUpperCase())),
});

export const gangSchema = z.object({
  id,
  name: z.string().min(1),
  foreman_employee_id: id.nullish(),
  afdeling_id: id,
});

export const activitySchema = z.object({
  id,
  code: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['harvest', 'upkeep', 'general']),
  wage_basis: z.enum(['daily', 'per_ha', 'per_tree', 'per_bunch']),
  rate: z.number().nonnegative(),
});

export const productSchema = z.object({ id, name: z.string().min(1), uom: z.string().min(1) });

export const dosageRuleSchema = z.object({
  id,
  activity_id: id,
  product_id: id,
  dose_per_ha: z.number().nonnegative(),
  tolerance_pct: z.number().nonnegative(),
});

export const vehicleSchema = z.object({ id, plate: z.string().min(1), type: z.string().min(1) });

export const penaltyRuleSchema = z.object({
  id,
  code: z.string().min(1),
  name: z.string().min(1),
  amount: z.number().nonnegative(),
});

export const isoDate = z.iso.date();

export const workPlanSchema = z.object({
  id,
  date: isoDate,
  afdeling_id: id,
  block_id: id,
  activity_id: id,
  gang_id: id,
  target_ha: z.number().nonnegative().nullish(),
  target_bunch: z.int().nonnegative().nullish(),
});

export const masterSchemas = {
  estate: estateSchema,
  afdeling: afdelingSchema,
  block: blockSchema,
  tph: tphSchema,
  employee: employeeSchema,
  gang: gangSchema,
  activity: activitySchema,
  product: productSchema,
  dosage_rule: dosageRuleSchema,
  vehicle: vehicleSchema,
  penalty_rule: penaltyRuleSchema,
  work_plan: workPlanSchema,
} as const;

export type MasterEntityName = keyof typeof masterSchemas;
export const MASTER_ENTITY_NAMES = Object.keys(masterSchemas) as MasterEntityName[];
export type MasterRecord<E extends MasterEntityName> = z.output<(typeof masterSchemas)[E]>;
export type MasterRecordInput<E extends MasterEntityName> = z.input<(typeof masterSchemas)[E]>;
