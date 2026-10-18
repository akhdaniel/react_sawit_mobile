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
    greeting: 'Halo, {name}',
    masterTitle: 'Data master di HP',
    masterEmpty: 'Belum ada data master. Lakukan sinkron di kantor.',
    noMenu: 'Peran Anda belum punya menu di aplikasi ini.',
    account: 'Akun & perangkat',
  },
  auth: {
    loginTitle: 'Masuk',
    loginHint: 'Login pertama butuh koneksi ke server (Wi-Fi kantor). Setelah itu aplikasi bisa dipakai tanpa sinyal dengan PIN.',
    login: 'Nama pengguna',
    password: 'Password',
    submit: 'Masuk',
    serverToggle: 'Pengaturan server',
    serverUrl: 'Alamat server',
    loginRequired: 'Nama pengguna wajib diisi',
    passwordRequired: 'Password wajib diisi',
    pinSetupTitle: 'Buat PIN',
    pinSetupHint: 'PIN {min}–{max} angka untuk membuka aplikasi saat tidak ada sinyal.',
    pinConfirmTitle: 'Ulangi PIN',
    pinMismatch: 'PIN tidak sama. Ulangi dari awal.',
    unlockTitle: 'Masukkan PIN',
    unlockHint: 'Masuk sebagai {name}',
    pinWrong: 'PIN salah. Sisa {count} percobaan sebelum harus login ulang.',
    pinLocked: 'Terlalu banyak salah. Coba lagi dalam {seconds} detik.',
    pinWiped: 'Terlalu banyak PIN salah. Silakan login ulang saat online.',
    forgotPin: 'Lupa PIN / ganti akun',
    forgotPinConfirm: 'Anda harus login ulang saat online. Data yang belum terkirim tetap aman di HP.',
    logout: 'Keluar',
    logoutConfirm: 'Keluar dari akun ini?',
    delete: 'Hapus',
    ok: 'OK',
  },
  account: {
    title: 'Akun & perangkat',
    user: 'Pengguna',
    roles: 'Peran',
    afdeling: 'Afdeling',
    deviceId: 'ID perangkat',
    deviceShort: 'Kode perangkat',
    appVersion: 'Versi aplikasi',
    server: 'Server',
    trustedTime: 'Waktu terpercaya',
    timeServer: 'Terkalibrasi server',
    timeDevice: 'Belum terkalibrasi (jam HP)',
    integrity: 'Integritas perangkat',
    integrityOk: 'Aman',
    location: 'Lokasi terakhir',
    locationNone: 'Belum ada',
    checkLocation: 'Cek lokasi sekarang',
  },
  role: {
    mandor_panen: 'Mandor panen',
    kerani_panen: 'Kerani panen',
    mandor_rawat: 'Mandor rawat',
    kerani_transport: 'Kerani transport',
    asisten: 'Asisten afdeling',
  },
  menu: {
    attendance: 'Absensi',
    assignment: 'Penugasan',
    harvest: 'Panen',
    transport: 'Transport / SPB',
    upkeep: 'Perawatan',
    approval: 'Persetujuan',
    dailyReport: 'Laporan harian',
    sync: 'Sinkron',
    comingSoon: 'Modul ini tersedia di tahap {stage}.',
    forbidden: 'Menu ini tidak tersedia untuk peran Anda.',
  },
  warning: {
    device_compromised: 'Perangkat terdeteksi root/emulator. Data tetap disimpan dan ditandai.',
    mocked_location: 'Lokasi palsu (fake GPS) terdeteksi. Data tetap disimpan dan ditandai.',
    mock_location_enabled: 'Aplikasi lokasi palsu aktif di opsi pengembang.',
    time_uncalibrated: 'Jam belum terkalibrasi server. Lakukan sinkron di kantor.',
    time_skew: 'Jam HP berbeda {minutes} menit dari waktu server.',
  },
  sync: {
    title: 'Sinkron',
    now: 'Sinkron sekarang',
    running: 'Sedang sinkron…',
    lastSync: 'Sinkron terakhir',
    never: 'Belum pernah',
    connection: 'Koneksi',
    online: 'Terhubung ({type})',
    offline: 'Tidak ada koneksi — data aman di HP',
    pendingTitle: 'Belum terkirim',
    photosPending: 'Foto belum terunggah',
    resultTitle: 'Hasil sinkron terakhir',
    resultOk: 'Berhasil',
    resultPartial: 'Sebagian gagal',
    sent: 'Dikirim',
    accepted: 'Diterima',
    rejected: 'Ditolak',
    posted: 'Diposting',
    photosUploaded: 'Foto terunggah',
    masterUpdated: 'Master diperbarui',
    rejectedTitle: 'Data ditolak server',
    rejectedHint: 'Buat transaksi koreksi dari modul terkait (koreksi merujuk data asal).',
    noRejected: 'Tidak ada data ditolak.',
    invalidTitle: 'Data tidak lolos validasi lokal (tidak dikirim)',
    reauthTitle: 'Login ulang ke server',
    reauthHint: 'Sesi server berakhir. Masukkan password untuk melanjutkan sinkron. Data di HP tetap aman.',
    reauthSubmit: 'Login ulang',
    errorKind: {
      offline: 'Tidak terhubung ke server',
      auth: 'Perlu login ulang',
      server: 'Kesalahan server',
      unknown: 'Kesalahan',
    },
    step: {
      push: 'Mengirim transaksi',
      photos: 'Mengunggah foto',
      status: 'Memeriksa status posting',
      master: 'Memperbarui data master',
      workplan: 'Mengambil rencana kerja',
      heartbeat: 'Melapor status perangkat',
    },
  },
  location: {
    permission_denied: 'Izin lokasi ditolak',
    services_disabled: 'GPS mati',
    unavailable: 'Lokasi belum didapat',
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
