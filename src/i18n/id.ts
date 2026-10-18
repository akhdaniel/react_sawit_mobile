/**
 * Semua teks UI (bahasa Indonesia) terpusat di sini.
 * Placeholder memakai format {nama}.
 */
export const id = {
  app: {
    name: 'Xerpium Sawit',
  },
  common: {
    loading: 'Memuat…',
    retry: 'Coba lagi',
    save: 'Simpan',
    cancel: 'Batal',
    back: 'Kembali',
    yes: 'Ya',
    no: 'Tidak',
  },
  boot: {
    openingDb: 'Membuka database terenkripsi…',
    migrating: 'Menyiapkan database…',
    dbError: 'Database gagal dibuka',
  },
  header: {
    pendingNone: 'Semua data terkirim',
    pendingSome: '{count} data belum terkirim',
  },
  home: {
    title: 'Beranda',
    masterTitle: 'Data master di HP',
    masterEmpty: 'Belum ada data master. Lakukan sinkron di kantor.',
    stageNote: 'Login, sinkron, dan menu per peran tersedia di tahap berikutnya.',
  },
  entity: {
    estate: 'Estate',
    afdeling: 'Afdeling',
    block: 'Blok',
    tph: 'TPH',
    employee: 'Pekerja',
    gang: 'Kemandoran',
    activity: 'Kegiatan',
    product: 'Material',
    dosage_rule: 'Aturan dosis',
    vehicle: 'Kendaraan',
    penalty_rule: 'Aturan denda',
    work_plan: 'Rencana kerja',
  },
  status: {
    draft: 'Draf',
    queued: 'Antre kirim',
    sent: 'Terkirim',
    accepted: 'Diterima',
    rejected: 'Ditolak',
    posted: 'Diposting',
  },
} as const;

export type Dictionary = typeof id;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;

/** Ambil teks berdasarkan key bertitik, mis. t('header.pendingSome', { count: 3 }). */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let node: unknown = id;
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown>)[part];
  }
  let text = typeof node === 'string' ? node : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
