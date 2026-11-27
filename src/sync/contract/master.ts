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
  /** Jumlah pokok blok: batas pokok dipupuk per tiket pemupukan (0/kosong = tidak dibatasi). */
  tree_count: z.int().nonnegative().nullish(),
  /** Rincian pokok master blok: dasar estimasi taksasi dan pembanding sensus (kosong dari server lama). */
  tree_count_productive: z.int().nonnegative().nullish(),
  tree_count_sisipan: z.int().nonnegative().nullish(),
  tree_count_dead: z.int().nonnegative().nullish(),
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
  /** Peran kebun di ERP (mis. 'pemanen', 'sopir'); sopir dipilih di SPB. */
  role: z.string().nullish(),
  /** Tipe karyawan ERP — penentu tarif panen (harvest_rate.employee_type). */
  employee_type: z.string().nullish(),
});

export const gangSchema = z.object({
  id,
  name: z.string().min(1),
  foreman_employee_id: id.nullish(),
  afdeling_id: id,
  /** Jenis kemandoran ERP; tiket pemupukan hanya untuk kemandoran rawat. */
  gang_type: z.enum(['panen', 'rawat']).nullish(),
  /** Mandor pengganti; ikut dianggap mandor kemandoran (penilaian sendiri pada inspeksi). */
  acting_foreman_employee_id: id.nullish(),
});

export const activitySchema = z.object({
  id,
  code: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['harvest', 'upkeep', 'general']),
  wage_basis: z.enum(['daily', 'per_ha', 'per_tree', 'per_bunch']),
  rate: z.number().nonnegative(),
});

export const productSchema = z.object({
  id,
  name: z.string().min(1),
  uom: z.string().min(1),
  /** Produk berkategori Pupuk ERP: dipilih di tiket pemupukan, bukan di material perawatan. */
  is_fertilizer: z.boolean().nullish(),
  /** Kelompok pupuk (Makro, Mikro, …): bersama metode dan kelas medan menentukan tarif upah. */
  fertilizer_group_id: id.nullish(),
  /** Dosis standar per pokok untuk satu kali aplikasi; kosong = tanpa batas dosis. */
  dosage_kg_per_tree: z.number().nonnegative().nullish(),
  /** Dosis standar material perawatan per Ha; kosong = tanpa batas dosis. */
  dosage_per_ha: z.number().nonnegative().nullish(),
});

export const dosageRuleSchema = z.object({
  id,
  activity_id: id,
  product_id: id,
  dose_per_ha: z.number().nonnegative(),
  tolerance_pct: z.number().nonnegative(),
});

/** Angkutan TBS. Truk sendiri wajib sopir karyawan; truk sewa cukup nama sopir. */
export const vehicleSchema = z.object({
  id,
  plate: z.string().min(1),
  type: z.string().min(1),
  ownership: z.enum(['own', 'rental']).nullish(),
});

/** Sub blok tiket panen; kelas medannya menentukan baris tarif panen. */
export const subBlokSchema = z.object({
  id,
  code: z.string().min(1),
  block_id: id,
  terrain_class_id: id,
});

export const HARVEST_GRADES = ['ripe', 'unripe', 'rotten', 'empty_bunch', 'long_stalk', 'loose_fruit'] as const;

export const harvestRateLineSchema = z.object({
  grade: z.enum(HARVEST_GRADES),
  line_type: z.enum(['premium', 'penalty']),
  basis: z.enum(['per_bunch', 'per_kg']),
  /** 'over_basis' dihitung per hari di ERP (premi lebih basis), bukan per tiket. */
  scope: z.enum(['all', 'over_basis']),
  terrain_class_id: id.nullish(),
  amount: z.number().nonnegative(),
});

export const FERTILIZATION_METHODS = ['manual', 'mekanis', 'drone'] as const;

/** Baris tarif pemupukan ERP; kolom kosong berlaku untuk semua nilai. */
export const fertilizationRateLineSchema = z.object({
  fertilizer_group_id: id.nullish(),
  method: z.enum(FERTILIZATION_METHODS).nullish(),
  terrain_class_id: id.nullish(),
  basis: z.enum(['per_tree', 'per_kg']),
  amount: z.number().nonnegative(),
});

/** Jenis perawatan ERP dan satuan hasil kerjanya (dasar upah). */
export const MAINTENANCE_WORK_TYPES = [
  'semprot_gulma',
  'babat_gawangan',
  'garuk_piringan',
  'dongkel_anak_kayu',
  'pruning',
  'kastrasi',
  'pengendalian_hama',
  'pengendalian_tikus',
  'perawatan_parit',
  'lainnya',
] as const;
export type MaintenanceWorkType = (typeof MAINTENANCE_WORK_TYPES)[number];
export const WORK_TYPE_UNITS: Readonly<Record<MaintenanceWorkType, 'ha' | 'tree' | 'hk'>> = {
  semprot_gulma: 'ha',
  babat_gawangan: 'ha',
  garuk_piringan: 'tree',
  dongkel_anak_kayu: 'ha',
  pruning: 'tree',
  kastrasi: 'tree',
  pengendalian_hama: 'ha',
  pengendalian_tikus: 'ha',
  perawatan_parit: 'hk',
  lainnya: 'hk',
};
/**
 * Pemakaian material per jenis perawatan, cermin ERP: wajib untuk pekerjaan kimia/umpan (material keluar
 * gudang saat verifikasi), tanpa material untuk pekerjaan manual, opsional untuk Lainnya.
 */
export const WORK_TYPE_MATERIALS: Readonly<Record<MaintenanceWorkType, 'required' | 'optional' | 'none'>> = {
  semprot_gulma: 'required',
  babat_gawangan: 'none',
  garuk_piringan: 'none',
  dongkel_anak_kayu: 'none',
  pruning: 'none',
  kastrasi: 'none',
  pengendalian_hama: 'required',
  pengendalian_tikus: 'required',
  perawatan_parit: 'none',
  lainnya: 'optional',
};

/** Baris tarif perawatan ERP: per jenis perawatan, kelas medan kosong = semua. */
export const maintenanceRateLineSchema = z.object({
  work_type: z.enum(MAINTENANCE_WORK_TYPES),
  terrain_class_id: id.nullish(),
  amount: z.number().nonnegative(),
});

/** Tarif panen aktif ERP — sumber estimasi premi panen dan upah pemupukan/perawatan di HP (sama dengan tiket ERP). */
export const harvestRateSchema = z.object({
  id,
  estate_id: id.nullish(),
  employee_type: z.string().nullish(),
  date_from: z.iso.date(),
  date_to: z.iso.date().nullish(),
  lines: z.array(harvestRateLineSchema),
  fertilization_lines: z.array(fertilizationRateLineSchema).nullish(),
  maintenance_lines: z.array(maintenanceRateLineSchema).nullish(),
});

export const pksSchema = z.object({ id, code: z.string().min(1), name: z.string().min(1), estate_id: id.nullish() });

/** @deprecated Denda kini dari baris tarif panen (harvest_rate); dikirim ERP hanya untuk HP versi lama. */
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

// ---- Inspeksi & QC (cermin xerpium_plantation_inspection) -----------------
export const INSPECTION_TYPES = ['taksasi', 'mutu_panen', 'mutu_rawat', 'sensus', 'hama_penyakit', 'infrastruktur', 'umum'] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];
export const SAMPLE_UNITS = ['pokok', 'ancak', 'tph', 'blok', 'titik'] as const;
export const INSPECTION_VALUE_TYPES = ['count', 'number', 'bool', 'score_1_5', 'select', 'text'] as const;
export type InspectionValueType = (typeof INSPECTION_VALUE_TYPES)[number];
export const BAD_WHEN = ['gt', 'lt', 'true', 'false', 'in'] as const;
export const FINDING_SEVERITIES = ['minor', 'major', 'critical'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
/** Kategori temuan ERP. Master memakai teks biasa agar kategori baru di ERP tidak memutus sinkron. */
export const FINDING_CATEGORIES = [
  'brondolan_tinggal',
  'buah_mentah_dipanen',
  'buah_matang_tinggal',
  'pelepah_tidak_disusun',
  'tangkai_panjang',
  'piringan_kotor',
  'gawangan_kotor',
  'pupuk_tidak_tepat',
  'hama',
  'penyakit',
  'pokok_mati',
  'pokok_abnormal',
  'infrastruktur_rusak',
  'lainnya',
] as const;

/** Template checklist inspeksi; `allowed_roles` = peran HP yang boleh membuat inspeksi dengan template ini. */
export const inspectionTemplateSchema = z.object({
  id,
  code: z.string().min(1),
  name: z.string().min(1),
  inspection_type: z.enum(INSPECTION_TYPES),
  sample_unit: z.enum(SAMPLE_UNITS),
  default_sample_size: z.int().nonnegative(),
  pass_score_pct: z.number().min(0).max(100),
  allowed_roles: z.array(z.string()),
});

export const inspectionItemSchema = z.object({
  id,
  template_id: id,
  sequence: z.int(),
  code: z.string().min(1),
  name: z.string().min(1),
  value_type: z.enum(INSPECTION_VALUE_TYPES),
  select_options: z.array(z.string()),
  uom: z.string().nullish(),
  weight: z.number().nonnegative(),
  bad_when: z.enum(BAD_WHEN).nullish(),
  threshold: z.number(),
  threshold_text: z.string().nullish(),
  finding_category: z.string().nullish(),
  finding_severity: z.enum(FINDING_SEVERITIES).nullish().transform((v) => v ?? 'minor'),
  required: z.boolean(),
});

/** Temuan terbuka/ditindaklanjuti ERP (semua afdeling; HP menyaring ke afdeling pengguna). */
export const openFindingSchema = z.object({
  id,
  mobile_uuid: z.string().nullish(),
  inspection_id: id.nullish(),
  blok_id: id,
  category: z.string().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  description: z.string(),
  row_no: z.int().nonnegative().nullish(),
  tree_no: z.int().nonnegative().nullish(),
  due_date: z.iso.date().nullish(),
  pic_employee_id: id.nullish(),
  state: z.enum(['open', 'in_progress']),
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
  work_plan: workPlanSchema,
  sub_blok: subBlokSchema,
  harvest_rate: harvestRateSchema,
  pks: pksSchema,
  inspection_template: inspectionTemplateSchema,
  inspection_item: inspectionItemSchema,
  open_finding: openFindingSchema,
} as const;

export type MasterEntityName = keyof typeof masterSchemas;
export const MASTER_ENTITY_NAMES = Object.keys(masterSchemas) as MasterEntityName[];
export type MasterRecord<E extends MasterEntityName> = z.output<(typeof masterSchemas)[E]>;
export type MasterRecordInput<E extends MasterEntityName> = z.input<(typeof masterSchemas)[E]>;
