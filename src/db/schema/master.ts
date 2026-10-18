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
});

export const penaltyRule = sqliteTable(
  'penalty_rule',
  {
    id: integer('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    amount: real('amount').notNull(),
  },
  (t) => [uniqueIndex('penalty_rule_code_uq').on(t.code)],
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
  penalty_rule: penaltyRule,
  work_plan: workPlan,
} as const;

export type MasterEntity = keyof typeof masterTables;
export const MASTER_ENTITIES = Object.keys(masterTables) as MasterEntity[];
