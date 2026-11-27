/**
 * Master data — MILIK SERVER. HP hanya menerima upsert/delete dari GET /master
 * (delta via cursor) dan tidak pernah mengubahnya sendiri.
 * Primary key = id record di Odoo.
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const estate = sqliteTable('estate', {
  id: integer('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
});

export const afdeling = sqliteTable(
  'afdeling',
  {
    id: integer('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    estateId: integer('estate_id').notNull(),
    /** GeoJSON Polygon/MultiPolygon batas afdeling (untuk cek absen di luar afdeling). */
    polygonGeojson: text('polygon_geojson'),
  },
  (t) => [index('afdeling_estate_idx').on(t.estateId)],
);

export const block = sqliteTable(
  'block',
  {
    id: integer('id').primaryKey(),
    code: text('code').notNull(),
    afdelingId: integer('afdeling_id').notNull(),
    ha: real('ha').notNull(),
    plantingYear: integer('planting_year'),
    status: text('status', { enum: ['TM', 'TBM'] }).notNull(),
    bjrKg: real('bjr_kg').notNull(),
    polygonGeojson: text('polygon_geojson'),
    /** Jumlah pokok blok (batas pokok dipupuk per tiket); null/0 = tidak dibatasi. */
    treeCount: integer('tree_count'),
    /** Rincian pokok master (taksasi: pokok produktif; sensus: pembanding). Null dari server lama. */
    treeCountProductive: integer('tree_count_productive'),
    treeCountSisipan: integer('tree_count_sisipan'),
    treeCountDead: integer('tree_count_dead'),
  },
  (t) => [index('block_afdeling_idx').on(t.afdelingId)],
);

export const tph = sqliteTable(
  'tph',
  {
    id: integer('id').primaryKey(),
    code: text('code').notNull(),
    blockId: integer('block_id').notNull(),
    lat: real('lat'),
    lng: real('lng'),
  },
  (t) => [index('tph_block_idx').on(t.blockId)],
);

export const employee = sqliteTable(
  'employee',
  {
    id: integer('id').primaryKey(),
    nik: text('nik').notNull(),
    name: text('name').notNull(),
    type: text('type', { enum: ['SKU', 'BHL', 'BORONGAN'] }).notNull(),
    gangId: integer('gang_id'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    /** UID kartu NFC pekerja (heksadesimal huruf besar), didaftarkan di ERP. */
    nfcUid: text('nfc_uid'),
    /** Peran kebun ERP, mis. 'pemanen', 'sopir'. */
    role: text('role'),
    /** Tipe karyawan ERP, penentu tarif panen. */
    employeeType: text('employee_type'),
  },
  (t) => [index('employee_gang_idx').on(t.gangId), index('employee_nik_idx').on(t.nik), index('employee_nfc_idx').on(t.nfcUid)],
);

export const gang = sqliteTable(
  'gang',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    foremanEmployeeId: integer('foreman_employee_id'),
    afdelingId: integer('afdeling_id').notNull(),
    /** 'panen' / 'rawat'; null pada data dari server versi lama. */
    gangType: text('gang_type', { enum: ['panen', 'rawat'] }),
    /** Mandor pengganti (ikut dianggap mandor kemandoran). */
    actingForemanEmployeeId: integer('acting_foreman_employee_id'),
  },
  (t) => [index('gang_afdeling_idx').on(t.afdelingId)],
);

export const activity = sqliteTable('activity', {
  id: integer('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['harvest', 'upkeep', 'general'] }).notNull(),
  wageBasis: text('wage_basis', { enum: ['daily', 'per_ha', 'per_tree', 'per_bunch'] }).notNull(),
  rate: real('rate').notNull(),
});

export const product = sqliteTable('product', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  uom: text('uom').notNull(),
  /** Pupuk dipilih di tiket pemupukan, bukan di material perawatan. */
  isFertilizer: integer('is_fertilizer', { mode: 'boolean' }),
  fertilizerGroupId: integer('fertilizer_group_id'),
  /** Dosis standar per pokok (kg) untuk satu kali aplikasi; null = tanpa batas. */
  dosageKgPerTree: real('dosage_kg_per_tree'),
  /** Dosis standar material perawatan per Ha; null = tanpa batas. */
  dosagePerHa: real('dosage_per_ha'),
});

export const dosageRule = sqliteTable(
  'dosage_rule',
  {
    id: integer('id').primaryKey(),
    activityId: integer('activity_id').notNull(),
    productId: integer('product_id').notNull(),
    dosePerHa: real('dose_per_ha').notNull(),
    tolerancePct: real('tolerance_pct').notNull(),
  },
  (t) => [uniqueIndex('dosage_rule_activity_product_uq').on(t.activityId, t.productId)],
);

export const vehicle = sqliteTable('vehicle', {
  id: integer('id').primaryKey(),
  plate: text('plate').notNull(),
  type: text('type').notNull(),
  /** 'own' = truk sendiri (sopir karyawan), 'rental' = truk sewa (nama sopir bebas). */
  ownership: text('ownership', { enum: ['own', 'rental'] }),
});

export const subBlok = sqliteTable(
  'sub_blok',
  {
    id: integer('id').primaryKey(),
    code: text('code').notNull(),
    blockId: integer('block_id').notNull(),
    terrainClassId: integer('terrain_class_id').notNull(),
  },
  (t) => [index('sub_blok_block_idx').on(t.blockId)],
);

export interface HarvestRateLine {
  grade: 'ripe' | 'unripe' | 'rotten' | 'empty_bunch' | 'long_stalk' | 'loose_fruit';
  line_type: 'premium' | 'penalty';
  basis: 'per_bunch' | 'per_kg';
  scope: 'all' | 'over_basis';
  terrain_class_id?: number | null;
  amount: number;
}

export interface FertilizationRateLine {
  fertilizer_group_id?: number | null;
  method?: 'manual' | 'mekanis' | 'drone' | null;
  terrain_class_id?: number | null;
  basis: 'per_tree' | 'per_kg';
  amount: number;
}

export interface MaintenanceRateLine {
  work_type: string;
  terrain_class_id?: number | null;
  amount: number;
}

/** Tarif panen aktif ERP; baris tarifnya disimpan utuh sebagai JSON. */
export const harvestRate = sqliteTable('harvest_rate', {
  id: integer('id').primaryKey(),
  estateId: integer('estate_id'),
  employeeType: text('employee_type'),
  /** YYYY-MM-DD */
  dateFrom: text('date_from').notNull(),
  dateTo: text('date_to'),
  lines: text('lines', { mode: 'json' }).$type<HarvestRateLine[]>().notNull(),
  /** Baris tarif pemupukan; null pada data dari server versi lama. */
  fertilizationLines: text('fertilization_lines', { mode: 'json' }).$type<FertilizationRateLine[]>(),
  /** Baris tarif perawatan; null pada data dari server versi lama. */
  maintenanceLines: text('maintenance_lines', { mode: 'json' }).$type<MaintenanceRateLine[]>(),
});

export const pks = sqliteTable('pks', {
  id: integer('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  estateId: integer('estate_id'),
});

/** Template checklist inspeksi ERP. */
export const inspectionTemplate = sqliteTable('inspection_template', {
  id: integer('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  inspectionType: text('inspection_type', {
    enum: ['taksasi', 'mutu_panen', 'mutu_rawat', 'sensus', 'hama_penyakit', 'infrastruktur', 'umum'],
  }).notNull(),
  sampleUnit: text('sample_unit').notNull(),
  defaultSampleSize: integer('default_sample_size').notNull(),
  passScorePct: real('pass_score_pct').notNull(),
  /** Peran HP yang boleh membuat inspeksi dengan template ini. */
  allowedRoles: text('allowed_roles', { mode: 'json' }).$type<string[]>().notNull(),
});

/** Item checklist template inspeksi (aturan "buruk", bobot skor, kategori & tingkat temuan bawaan). */
export const inspectionItem = sqliteTable(
  'inspection_item',
  {
    id: integer('id').primaryKey(),
    templateId: integer('template_id').notNull(),
    sequence: integer('sequence').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    valueType: text('value_type', { enum: ['count', 'number', 'bool', 'score_1_5', 'select', 'text'] }).notNull(),
    selectOptions: text('select_options', { mode: 'json' }).$type<string[]>().notNull(),
    uom: text('uom'),
    weight: real('weight').notNull(),
    badWhen: text('bad_when', { enum: ['gt', 'lt', 'true', 'false', 'in'] }),
    threshold: real('threshold').notNull(),
    thresholdText: text('threshold_text'),
    findingCategory: text('finding_category'),
    findingSeverity: text('finding_severity', { enum: ['minor', 'major', 'critical'] }).notNull(),
    required: integer('required', { mode: 'boolean' }).notNull(),
  },
  (t) => [index('inspection_item_template_idx').on(t.templateId)],
);

/** Temuan ERP yang masih terbuka/ditindaklanjuti (bahan tindak lanjut offline). */
export const openFinding = sqliteTable(
  'open_finding',
  {
    id: integer('id').primaryKey(),
    /** UUID temuan dari HP (null untuk temuan yang dibuat di ERP). */
    mobileUuid: text('mobile_uuid'),
    inspectionId: integer('inspection_id'),
    blokId: integer('blok_id').notNull(),
    category: text('category').notNull(),
    severity: text('severity', { enum: ['minor', 'major', 'critical'] }).notNull(),
    description: text('description').notNull(),
    rowNo: integer('row_no'),
    treeNo: integer('tree_no'),
    dueDate: text('due_date'),
    picEmployeeId: integer('pic_employee_id'),
    state: text('state', { enum: ['open', 'in_progress'] }).notNull(),
  },
  (t) => [index('open_finding_blok_idx').on(t.blokId), index('open_finding_mobile_uuid_idx').on(t.mobileUuid)],
);

export const workPlan = sqliteTable(
  'work_plan',
  {
    id: integer('id').primaryKey(),
    /** YYYY-MM-DD */
    date: text('date').notNull(),
    afdelingId: integer('afdeling_id').notNull(),
    blockId: integer('block_id').notNull(),
    activityId: integer('activity_id').notNull(),
    gangId: integer('gang_id').notNull(),
    targetHa: real('target_ha'),
    targetBunch: integer('target_bunch'),
  },
  (t) => [index('work_plan_date_afdeling_idx').on(t.date, t.afdelingId)],
);

export const syncCursor = sqliteTable(
  'sync_cursor',
  {
    entity: text('entity').notNull(),
    cursor: text('cursor').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entity] })],
);

/** Tabel master yang disinkron lewat GET /master, dikunci dengan nama entitas di kontrak API. */
export const masterTables = {
  estate,
  afdeling,
  block,
  tph,
  employee,
  gang,
  activity,
  product,
  dosage_rule: dosageRule,
  vehicle,
  work_plan: workPlan,
  sub_blok: subBlok,
  harvest_rate: harvestRate,
  pks,
  inspection_template: inspectionTemplate,
  inspection_item: inspectionItem,
  open_finding: openFinding,
} as const;

export type MasterEntity = keyof typeof masterTables;
export const MASTER_ENTITIES = Object.keys(masterTables) as MasterEntity[];
