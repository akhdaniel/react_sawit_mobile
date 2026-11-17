/**
 * Data dummy deterministik: 1 estate, 3 afdeling, 40 blok (+ sub blok), 120 TPH, 200 pekerja + sopir,
 * plus gang, kegiatan, material, aturan dosis, kendaraan, tarif panen, PKS, rencana kerja,
 * dan akun uji per peran (struktur master ERP).
 */
import type { AuthUser, MasterEntityName, MasterRecordInput, Role } from '../../src/sync/contract';

/** Password semua akun uji mock server. */
export const TEST_PASSWORD = 'sawit123';

export interface SeedUser extends AuthUser {
  login: string;
  password: string;
}

export type SeedMaster = { [E in MasterEntityName]: MasterRecordInput<E>[] };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

/** Kelas medan (id ERP) untuk sub blok dan baris tarif panen. */
const TERRAIN_FLAT = 1;
const TERRAIN_HILLY = 2;

type Ring = [number, number][];
const rect = (lng0: number, lat0: number, lng1: number, lat1: number): Ring => [
  [lng0, lat0],
  [lng1, lat0],
  [lng1, lat1],
  [lng0, lat1],
  [lng0, lat0],
];
const polygon = (ring: Ring) => ({ type: 'Polygon', coordinates: [ring.map(([x, y]) => [round(x), round(y)])] });

const FIRST = ['Agus', 'Budi', 'Cahyo', 'Dedi', 'Eko', 'Fajar', 'Gunawan', 'Hendra', 'Imam', 'Joko', 'Kurnia', 'Lukman', 'Made', 'Nanda', 'Oki', 'Putra', 'Rahmat', 'Slamet', 'Teguh', 'Udin', 'Wahyu', 'Yusuf', 'Zainal', 'Siti', 'Rina', 'Dewi', 'Sri', 'Tuti'];
const LAST = ['Saputra', 'Siregar', 'Nasution', 'Harahap', 'Lubis', 'Simanjuntak', 'Wibowo', 'Santoso', 'Hidayat', 'Pratama', 'Gultom', 'Purba', 'Sinaga', 'Hasibuan', 'Setiawan'];

/** Tanggal kalender YYYY-MM-DD di zona Asia/Jakarta. */
export function jakartaDate(d = new Date(), addDays = 0): string {
  const shifted = new Date(d.getTime() + addDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(shifted);
}

export const BASE = { lat: 0.5, lng: 101.4 };
const AFD_W = 0.03; // derajat bujur per afdeling
const AFD_H = 0.05; // derajat lintang
const COLS = 3;
const ROWS = 5;

export function buildSeed(today = jakartaDate()): { master: SeedMaster; users: SeedUser[] } {
  const rnd = mulberry32(42);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

  const estate = [{ id: 1, code: 'SWT1', name: 'Kebun Sawit Indah' }];

  const afdCodes = ['AFD01', 'AFD02', 'AFD03'];
  const afdeling = afdCodes.map((code, i) => ({
    id: i + 1,
    code,
    name: `Afdeling ${['I', 'II', 'III'][i]}`,
    estate_id: 1,
    polygon_geojson: polygon(rect(BASE.lng + i * AFD_W, BASE.lat, BASE.lng + (i + 1) * AFD_W, BASE.lat + AFD_H)),
  }));

  // 40 blok: 14 + 13 + 13, grid 3×5 di dalam afdeling.
  const blocksPerAfd = [14, 13, 13];
  const block: SeedMaster['block'] = [];
  const sub_blok: SeedMaster['sub_blok'] = [];
  const tph: SeedMaster['tph'] = [];
  let blockId = 0;
  let tphId = 0;
  blocksPerAfd.forEach((n, ai) => {
    for (let k = 0; k < n; k++) {
      blockId++;
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const w = AFD_W / COLS;
      const h = AFD_H / ROWS;
      const lng0 = BASE.lng + ai * AFD_W + col * w;
      const lat0 = BASE.lat + row * h;
      const tbm = blockId % 10 === 0;
      const year = tbm ? 2023 : 1998 + Math.floor(rnd() * 20);
      const age = 2026 - year;
      const code = `${'ABC'[ai]}${String(k + 1).padStart(2, '0')}`;
      block.push({
        id: blockId,
        code,
        afdeling_id: ai + 1,
        ha: round(20 + rnd() * 15, 2),
        planting_year: year,
        status: tbm ? 'TBM' : 'TM',
        bjr_kg: tbm ? 0 : round(Math.min(26, 6 + age * 0.9 + rnd() * 2), 1),
        polygon_geojson: polygon(rect(lng0, lat0, lng0 + w, lat0 + h)),
        tree_count: 2000 + Math.floor(rnd() * 1500),
      });
      // Sub blok utama; tiap blok ke-5 punya dua sub blok dengan kelas medan berbeda.
      sub_blok.push({ id: sub_blok.length + 1, code: 'A', block_id: blockId, terrain_class_id: TERRAIN_FLAT });
      if (blockId % 5 === 0) sub_blok.push({ id: sub_blok.length + 1, code: 'B', block_id: blockId, terrain_class_id: TERRAIN_HILLY });
      for (let t = 1; t <= 3; t++) {
        tphId++;
        tph.push({
          id: tphId,
          code: `${code}-T${t}`,
          block_id: blockId,
          lat: round(lat0 + (h * t) / 4),
          lng: round(lng0 + w * (0.2 + rnd() * 0.6)),
        });
      }
    }
  });

  // 12 gang: per afdeling 3 panen + 1 rawat.
  const gang: SeedMaster['gang'] = [];
  for (let ai = 0; ai < 3; ai++) {
    for (let g = 0; g < 4; g++) {
      gang.push({
        id: gang.length + 1,
        name: g < 3 ? `Panen ${afdCodes[ai]}-${g + 1}` : `Rawat ${afdCodes[ai]}`,
        foreman_employee_id: null,
        afdeling_id: ai + 1,
        gang_type: g < 3 ? ('panen' as const) : ('rawat' as const),
      });
    }
  }

  // 200 pekerja dibagi rata ke 12 gang; pekerja pertama tiap gang = mandor.
  const employee: SeedMaster['employee'] = [];
  for (let i = 0; i < 200; i++) {
    const g = gang[i % gang.length]!;
    const r = rnd();
    employee.push({
      id: i + 1,
      nik: `1401${String(10_000_000 + i * 7919).padStart(12, '0')}`,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      type: r < 0.6 ? 'SKU' : r < 0.9 ? 'BHL' : 'BORONGAN',
      employee_type: r < 0.6 ? 'employee' : 'daily_worker',
      role: g.name.startsWith('Panen') ? 'pemanen' : 'pekerja_rawat',
      gang_id: g.id,
      active: i % 41 !== 40, // beberapa pekerja nonaktif
      nfc_uid: `04${(0xa10000 + i + 1).toString(16).toUpperCase()}A5B680`, // UID 7 byte kartu dummy
    });
    if (g.foreman_employee_id == null) g.foreman_employee_id = i + 1;
  }
  // Sopir truk sendiri (tanpa kemandoran).
  for (let i = 0; i < 6; i++) {
    employee.push({ id: 201 + i, nik: `1499${String(9000 + i).padStart(12, '0')}`, name: `Sopir ${pick(FIRST)}`, type: 'SKU', gang_id: null, active: true, role: 'sopir', employee_type: 'employee' });
  }

  const activity: SeedMaster['activity'] = [
    { id: 1, code: 'PN01', name: 'Panen TBS', kind: 'harvest', wage_basis: 'per_bunch', rate: 2500 },
    { id: 2, code: 'RW01', name: 'Semprot herbisida', kind: 'upkeep', wage_basis: 'per_ha', rate: 75_000 },
    { id: 3, code: 'RW02', name: 'Pemupukan', kind: 'upkeep', wage_basis: 'per_ha', rate: 60_000 },
    { id: 4, code: 'RW03', name: 'Tunas pokok', kind: 'upkeep', wage_basis: 'per_tree', rate: 1_500 },
    { id: 5, code: 'RW04', name: 'Dongkel anak kayu', kind: 'upkeep', wage_basis: 'per_ha', rate: 55_000 },
    { id: 6, code: 'UM01', name: 'Kerja umum', kind: 'general', wage_basis: 'daily', rate: 120_000 },
  ];

  const product: SeedMaster['product'] = [
    // Herbisida dengan dosis standar per Ha (material tiket perawatan).
    { id: 1, name: 'Glifosat 480 SL', uom: 'L', is_fertilizer: false, dosage_per_ha: 2 },
    { id: 2, name: 'Parakuat 276 SL', uom: 'L', is_fertilizer: false, dosage_per_ha: 1.5 },
    // Pupuk (kategori Pupuk ERP): kelompok 1 = Makro, 2 = Makro Curah; dosis per pokok per aplikasi.
    { id: 3, name: 'Urea', uom: 'kg', is_fertilizer: true, fertilizer_group_id: 1, dosage_kg_per_tree: 1.25 },
    { id: 4, name: 'NPK 15-15-15', uom: 'kg', is_fertilizer: true, fertilizer_group_id: 1, dosage_kg_per_tree: 2 },
    { id: 5, name: 'MOP (KCl)', uom: 'kg', is_fertilizer: true, fertilizer_group_id: 1, dosage_kg_per_tree: 1.5 },
    { id: 6, name: 'Dolomit', uom: 'kg', is_fertilizer: true, fertilizer_group_id: 2, dosage_kg_per_tree: 1.5 },
  ];

  const dosage_rule: SeedMaster['dosage_rule'] = [
    { id: 1, activity_id: 2, product_id: 1, dose_per_ha: 1.5, tolerance_pct: 10 },
    { id: 2, activity_id: 2, product_id: 2, dose_per_ha: 1.0, tolerance_pct: 10 },
    { id: 3, activity_id: 3, product_id: 3, dose_per_ha: 150, tolerance_pct: 5 },
    { id: 4, activity_id: 3, product_id: 4, dose_per_ha: 200, tolerance_pct: 5 },
    { id: 5, activity_id: 3, product_id: 5, dose_per_ha: 100, tolerance_pct: 5 },
    { id: 6, activity_id: 3, product_id: 6, dose_per_ha: 250, tolerance_pct: 5 },
  ];

  const vehicleTypes = ['Dump Truck', 'Colt Diesel', 'Traktor Gandeng'];
  const vehicle: SeedMaster['vehicle'] = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    plate: `BM ${8101 + i * 37} ${pick(['AK', 'BU', 'CS', 'DR'])}`,
    type: vehicleTypes[i % vehicleTypes.length]!,
    ownership: i < 6 ? ('own' as const) : ('rental' as const),
  }));

  // Tarif panen ERP: umum per janjang, dan khusus pekerja harian per kg dengan kelas medan.
  const harvest_rate: SeedMaster['harvest_rate'] = [
    {
      id: 1,
      estate_id: 1,
      employee_type: null,
      date_from: '2026-01-01',
      date_to: null,
      lines: [
        { grade: 'ripe', line_type: 'premium', basis: 'per_bunch', scope: 'all', amount: 2_500 },
        { grade: 'unripe', line_type: 'penalty', basis: 'per_bunch', scope: 'all', amount: 5_000 },
        { grade: 'long_stalk', line_type: 'penalty', basis: 'per_bunch', scope: 'all', amount: 1_000 },
        { grade: 'loose_fruit', line_type: 'premium', basis: 'per_kg', scope: 'all', amount: 150 },
      ],
      fertilization_lines: [
        { fertilizer_group_id: 1, method: 'manual', basis: 'per_kg', amount: 300 },
        { fertilizer_group_id: 1, method: 'manual', terrain_class_id: TERRAIN_HILLY, basis: 'per_kg', amount: 350 },
        { fertilizer_group_id: 2, method: 'manual', basis: 'per_kg', amount: 150 },
        { fertilizer_group_id: null, method: 'mekanis', basis: 'per_tree', amount: 80 },
      ],
      maintenance_lines: [
        { work_type: 'semprot_gulma', amount: 60_000 },
        { work_type: 'semprot_gulma', terrain_class_id: TERRAIN_HILLY, amount: 75_000 },
        { work_type: 'pruning', amount: 1_500 },
        { work_type: 'perawatan_parit', amount: 110_000 },
      ],
    },
    {
      id: 2,
      estate_id: 1,
      employee_type: 'daily_worker',
      date_from: '2026-01-01',
      date_to: null,
      lines: [
        { grade: 'ripe', line_type: 'premium', basis: 'per_kg', scope: 'all', terrain_class_id: TERRAIN_FLAT, amount: 120 },
        { grade: 'ripe', line_type: 'premium', basis: 'per_kg', scope: 'all', terrain_class_id: TERRAIN_HILLY, amount: 150 },
        { grade: 'unripe', line_type: 'penalty', basis: 'per_kg', scope: 'all', amount: 100 },
        { grade: 'loose_fruit', line_type: 'premium', basis: 'per_kg', scope: 'all', amount: 150 },
      ],
    },
  ];

  const pks: SeedMaster['pks'] = [
    { id: 1, code: 'PKS1', name: 'PKS Sawit Indah', estate_id: 1 },
    { id: 2, code: 'PKSM', name: 'PKS Mitra Rokan', estate_id: null },
  ];

  // Rencana kerja 7 hari mulai hari ini: tiap gang panen ke blok TM bergilir, gang rawat ke satu blok.
  const work_plan: SeedMaster['work_plan'] = [];
  for (let d = 0; d < 7; d++) {
    const date = shiftDate(today, d);
    for (const g of gang) {
      const tm = block.filter((b) => b.afdeling_id === g.afdeling_id && b.status === 'TM');
      const harvest = g.name.startsWith('Panen');
      const idx = (g.id * 3 + d) % tm.length;
      const b = tm[idx]!;
      work_plan.push({
        id: work_plan.length + 1,
        date,
        afdeling_id: g.afdeling_id,
        block_id: b.id,
        activity_id: harvest ? 1 : d % 2 === 0 ? 2 : 3,
        gang_id: g.id,
        target_ha: round(b.ha * 0.5, 2),
        target_bunch: harvest ? Math.round(b.ha * 0.5 * 120) : null,
      });
    }
  }

  const user = (id: number, login: string, name: string, roles: Role[], afdeling_ids: number[]): SeedUser => ({
    id,
    login,
    password: TEST_PASSWORD,
    name,
    roles,
    afdeling_ids,
  });
  const users = [
    user(101, 'mandor.panen', 'Slamet Riyadi', ['mandor_panen'], [1]),
    user(102, 'kerani.panen', 'Rina Marlina', ['kerani_panen'], [1]),
    user(103, 'mandor.rawat', 'Joko Susilo', ['mandor_rawat'], [1]),
    user(104, 'kerani.transport', 'Dedi Kurniawan', ['kerani_transport'], [1, 2, 3]),
    user(105, 'asisten', 'Ir. Hendra Gunawan', ['asisten'], [1]),
    user(106, 'asisten2', 'Siti Aminah', ['asisten'], [2, 3]),
  ];

  return {
    master: { estate, afdeling, block, tph, employee, gang, activity, product, dosage_rule, vehicle, work_plan, sub_blok, harvest_rate, pks },
    users,
  };
}

export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
