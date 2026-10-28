# Xerpium Sawit Mobile

Aplikasi Android lapangan **offline-first** untuk perkebunan kelapa sawit (mandor, kerani, asisten afdeling).
Semua data lapangan disimpan di SQLite terenkripsi di HP dan disinkronkan ke ERP Xerpium (Odoo 18)
melalui REST API `/xsm/v1` saat ada Wi-Fi kantor.

**Panduan pengguna** (alur harian, langkah per peran, status data, masalah umum): [docs/PANDUAN_PENGGUNA.md](docs/PANDUAN_PENGGUNA.md).

> **Status: Tahap 9 — NFC kartu pekerja (semua tahap selesai).**
> - Tahap 1 (fondasi): Expo SDK 58, DB terenkripsi + migrasi, kontrak zod bersama, trigger append-only, mock server.
> - Tahap 2: login online, PIN offline + kunci otomatis, menu per peran, trusted-time (modul native jam monotonic),
>   deteksi root/emulator/fake GPS + banner, HTTP client (timeout/retry/backoff) dan refresh token.
> - Tahap 3: sync engine (push antrean idempoten, unggah foto, polling posted, delta master berhalaman,
>   rencana kerja, heartbeat), sinkron latar (Wi-Fi), sinkron otomatis saat Wi-Fi tersambung, layar Sinkron.
> - Tema "Xerpium Violet" (header gradien, kartu membulat, uji kontras WCAG).
> - Tahap 4: absensi per kemandoran dengan foto kamera dalam aplikasi, cek polygon afdeling, koreksi
>   append-only, dan penugasan berdasarkan rencana kerja / di luar rencana.
>
> - Tahap 5: tiket panen offline (≤ 3 ketukan), susulan otomatis, est_kg & estimasi premi, koreksi, QR.
> - Tahap 6: SPB dari pindai QR / tiket lokal, langsir, potensi restan, cetak ESC/POS via printer Bluetooth.
> - Tahap 7: perawatan + pemakaian material dengan deteksi over-dose ke antrean approval.
> - Tahap 8: inbox approval offline untuk asisten, keputusan, laporan harian bertanda tangan.
> - Tahap 9: kartu NFC pekerja untuk absensi dan memilih pemanen.

## Prasyarat

| Kebutuhan | Versi | Catatan |
|---|---|---|
| Node.js | 22.x | |
| JDK | **17** | Di mesin ini: JetBrains JBR 17 (`~/Library/Java/JavaVirtualMachines/jbr-17.0.14`) |
| Android SDK | API 36 + build-tools | `~/Library/Android/sdk` |
| HP Android / emulator | Android 8.0+ (minSdk 26) | |

Tambahkan ke `~/.zshrc` (`ANDROID_HOME` belum di-set di mesin ini):

```bash
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/jbr-17.0.14/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

**Watchman rusak di mesin ini** (`libcrypto.1.0.0.dylib` tidak ditemukan). Jest sudah diatur untuk tidak
memakai watchman. Agar Metro tidak terganggu, perbaiki atau hapus watchman:

```bash
brew reinstall watchman
```

## Menjalankan

Aplikasi memakai modul native (SQLCipher, VisionCamera, BLE), jadi **wajib development build**.
Expo Go tidak bisa dipakai.

```bash
npm install
npm install --prefix mock-server
```

1. Jalankan mock server (port 8080, terbuka di semua interface):

   ```bash
   npm run mock-server
   ```

2. Build dan pasang development build ke emulator atau HP via USB (build pertama ±5–10 menit):

   ```bash
   npm run android
   ```

3. Setelah itu, cukup jalankan Metro:

   ```bash
   npm start
   ```

URL API dibaca dari `expo.extra.apiBaseUrl` di `app.json`. Default-nya `http://10.0.2.2:8080/xsm/v1` (emulator).
Untuk HP fisik di Wi-Fi yang sama, pakai alamat LAN yang dicetak mock server saat start.

Jika `app.json` atau daftar plugin native berubah, generate ulang folder native:

```bash
npm run prebuild
```

Folder `android/` tidak di-commit (Continuous Native Generation). Jangan edit manual.

### APK release untuk HP uji

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Hasilnya `android/app/build/outputs/apk/release/app-release.apk`, untuk satu ABI saja (±55 MB) dan sudah membawa bundel JS.
APK ini ditandatangani debug keystore, jadi hanya untuk uji, bukan untuk Play Store.

**R8/minify sengaja dimatikan** (`enableMinifyInReleaseBuilds: false` di `app.json`). Dengan R8 aktif,
APK Tahap 1 crash di Samsung A06 saat start: R8 membuang constructor yang dipanggil lewat refleksi oleh WorkManager
(`androidx.work.impl.WorkDatabase`, dipakai `expo-background-task`) dan oleh registrar ML Kit.
Aktifkan lagi hanya bersama keep rules yang sudah diuji di perangkat.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm test` | Unit test aplikasi (Jest + jest-expo) |
| `npm run test:mock` | Test mock server + integrasi klien app (login, refresh, kalibrasi waktu, sync engine ujung-ke-ujung) |
| `npm run test:all` | Keduanya |
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint (eslint-config-expo) |
| `npm run db:generate -- --name=<nama>` | Buat migrasi baru dari perubahan skema Drizzle |
| `npm run db:guards -- <file.sql> [--drop]` | Tulis trigger append-only ke migrasi custom |

## Login, PIN, dan sesi (tahap 2)

| Situasi | Perilaku |
|---|---|
| Pertama kali | Login online (`POST /auth/token`) lalu buat PIN 4–6 angka |
| Buka app (offline) | Masukkan PIN; app berjalan penuh tanpa sinyal |
| Di latar belakang > 5 menit | Terkunci, minta PIN (diukur dengan jam monotonic) |
| PIN salah 5× | Dikunci 30 detik, lalu berlipat (60, 120, … detik) |
| PIN salah 10× | Sesi dihapus, wajib login online lagi; data di HP tetap aman |
| Lupa PIN | Sesi dihapus, login online ulang, lalu buat PIN baru |
| Token server kedaluwarsa | Hanya sinkron yang terhenti (`AuthRequiredError`); kerja offline jalan terus |
| Ganti akun / logout | Ditolak selama masih ada data belum terkirim |

- **PIN** disimpan sebagai `SHA-256(salt + PIN)` di `expo-secure-store`.
- **Token** (`access`, `refresh`, `expires_at`) juga disimpan di `expo-secure-store`.
- **Menu** per peran ada di `src/features/menu/menu.ts`.
- **Alamat server** bisa diubah di layar login lewat "Pengaturan server", misalnya ke IP LAN mock server untuk HP fisik.
  Nilainya disimpan di `app_meta`.

## Trusted time (tahap 2)

`trusted_time = server_time saat kalibrasi terakhir + (elapsedRealtime sekarang − elapsedRealtime saat kalibrasi)`.

- **Modul native lokal `modules/xsm-clock`** (Kotlin) menyediakan `SystemClock.elapsedRealtime()` dan
  `Settings.Global.BOOT_COUNT`. Jam ini tidak terpengaruh perubahan jam/zona waktu oleh pengguna dan tetap jalan saat HP tidur.
- **Kalibrasi** terjadi otomatis setiap kali respons API membawa `server_time`. Anchor disimpan di `app_meta`.
- **Setelah reboot**, anchor batal. Waktu lalu diperkirakan dari jam HP dikoreksi selisih terakhir, sampai sinkron berikutnya.
  - Transaksi ditandai `time_source = 'device'` (migrasi `0002`), dan server memberi flag `untrusted_time`.
  - Banner "Jam belum terkalibrasi" tampil.
- **Banner "Jam HP berbeda X menit"** tampil bila jam HP selisih lebih dari 5 menit dari trusted time.
- **Tanggal kerja** memakai zona estate (`estateUtcOffsetMinutes`, default WIB +420), bukan zona HP.

## Integritas perangkat (tahap 2)

`jail-monkey` dan `expo-device` mendeteksi root, emulator, hooking, dan aplikasi lokasi palsu.
Field `location.mocked` dari expo-location mendeteksi fake GPS. Aplikasi **tidak memblokir**: transaksi tetap disimpan
dengan flag `rooted`/`mocked`, dan banner merah/kuning tampil di setiap layar.

## Sync engine (tahap 3)

`src/sync/engine.ts` adalah **satu-satunya** tempat aplikasi memanggil API. Langkahnya berurutan:

| Langkah | Isi |
|---|---|
| 1. push | Antrean `queued` + `sent`, maks 500 per batch, urut dependensi: absen → penugasan → panen → SPB → rawat → material → laporan → approval |
| 2. photos | Foto milik transaksi yang sudah dikenal server, multipart + SHA-256 |
| 3. status | `GET /transactions/status` per 100 id untuk transaksi `accepted` → `posted`/`rejected` |
| 4. master | `GET /master?since=<cursor>` mengikuti `has_more`; tiap halaman + cursor diterapkan atomik |
| 5. workplan | `GET /workplan?date=<tanggal kerja>` |
| 6. heartbeat | `POST /device/heartbeat` (baterai, jumlah pending, sinkron terakhir) |

**Aturan penting:**

- **Idempoten.** Status `sent` berarti hasil kiriman belum pasti, misalnya koneksi putus di tengah. Item `sent` dikirim
  ulang pada sinkron berikutnya, dan server menjawab `duplicate`, yang dianggap sukses. HTTP 409 untuk seluruh batch
  juga dianggap duplicate.
- **Hasil server diterapkan hanya ke kolom status** (`status`, `server_id`, `reject_reason`, `sent_at`, `posted_at`).
  Trigger append-only menjamin kolom bisnis tidak berubah.
- **Penanganan error:**
  - Offline (`NetworkError`) atau token habis (`AuthRequiredError`) → sinkron berhenti, data tetap di antrean.
    Untuk token habis, layar Sinkron menampilkan form "Login ulang" (password saja, PIN dan data offline tidak terganggu).
  - Error server pada satu langkah → dicatat, langkah lain tetap dijalankan.
- **Item yang gagal validasi zod lokal** tidak dikirim dan ditampilkan di layar Sinkron.
- **Foto:**
  - File hilang atau ditolak server (4xx) → `failed`.
  - Gangguan jaringan → kembali `pending`.
- **Single-flight.** Tombol, sinkron otomatis, dan task latar tidak pernah berjalan bersamaan.

**Kapan sinkron berjalan:**

- **Manual:** tombol di layar Sinkron, yang bisa dibuka dari menu atau dengan mengetuk indikator "X data belum terkirim".
- **Otomatis:** saat Wi-Fi tersambung dan ada data pending, paling sering tiap 10 menit.
- **Latar:** `expo-background-task` (WorkManager) tiap ±60 menit, hanya di Wi-Fi, best effort (Android bisa menunda).
  Task didefinisikan di `src/sync/background-task.ts` dan diimpor dari `app/_layout.tsx`.

## Absensi & penugasan (tahap 4)

**Absensi** (`app/(app)/attendance.tsx`), per kemandoran (gang) di afdeling pengguna:

| Aksi | Ketukan | Catatan |
|---|---|---|
| Absen masuk semua yang belum | 2–3 | Tombol → (alasan bila terlambat) → foto grup → tersimpan |
| Per pekerja: hadir / terlambat | 2–3 | Wajib foto dari kamera aplikasi |
| Per pekerja: sakit / izin / mangkir | 2 | Tanpa foto |
| Absen pulang semua | 1 | Hanya pekerja yang hadir dan belum pulang |
| Koreksi status | 2–3 | Baris baru dengan `correction_of`, baris asal tidak diubah |
| Pekerja dari kemandoran lain | 3+ | Cari nama/NIK; tetap berlaku aturan satu gang per hari |

**Aturan** (`db/repositories/attendance.ts`, juga dicek ulang oleh server):

- **Baris efektif** = tidak ditolak server dan tidak digantikan koreksi.
- **Hadir** = check-in efektif berstatus `hadir`/`terlambat`. Sakit, izin, dan mangkir tidak dihitung hadir.
- **Satu pekerja hanya check-in di satu gang per hari.** Check-out butuh check-in hadir di gang yang sama, dan hanya sekali.
- **Default `terlambat`** bila waktu check-in lewat `workStartTime` (default 06:30, zona estate). Alasan wajib diisi.
- **Di luar polygon afdeling** → `outside_afdeling = true`. Transaksi tidak diblokir, server memberi flag ke asisten.
- **Kolom anti-fraud** (lokasi + `mocked`, `rooted`, trusted time, `time_source`) dibuat oleh `features/common/tx-factory.ts`
  untuk setiap transaksi. Posisi GPS diambil segar (≤ 60 detik) saat menyimpan.

**Foto bukti** (`features/camera/CameraCapture.tsx`, `lib/photo.ts`):

- Hanya dari kamera aplikasi (VisionCamera v5); izin galeri diblokir di manifest.
- Dikompres ke sisi terpanjang ≤ 1280 px, JPEG 0.6. Kualitas diturunkan bertahap sampai ≤ 300 KB,
  lalu bila perlu resolusi diturunkan ke 960 px.
- Disimpan di folder dokumen privat app. SHA-256 dihitung dari file final dan tidak bisa diubah (trigger `PHOTO_IMMUTABLE`).
- Satu foto grup dipakai untuk semua baris absensi massal. Foto ditautkan ke baris pertama dan diunggah saat sinkron.

**Penugasan** (`app/(app)/assignment/`):

- Pilih rencana kerja hari ini untuk gang tersebut, atau "di luar rencana" (kegiatan + blok + alasan wajib).
- Lalu pilih pekerja dari daftar yang sudah absen hadir dan belum pulang.
- Pekerja tanpa check-in hadir tidak bisa ditugaskan.

## Panen (tahap 5)

`app/(app)/harvest/` · `db/repositories/harvest.ts` · `features/harvest/`

**Input tiket (≤ 3 ketukan):** pilih TPH, pilih pemanen yang sudah absen hadir, isi janjang matang, lalu Simpan.
- Blok default diambil dari penugasan panen atau rencana kerja gang hari ini.
- Rincian mentah, busuk, janjang kosong, tangkai panjang, dan brondolan bersifat opsional.

**Nomor tiket** dibuat offline secara atomik, misalnya `AFD01-261018-K3ZQ-0007`.

**Susulan:** tiket kedua untuk TPH + pemanen + tanggal yang sama otomatis ditandai `is_late_entry`, dan peringatannya tampil sebelum menyimpan.

**Kalkulasi:**
- `est_kg = (matang + mentah + busuk) × BJR blok`.
- Estimasi premi: `per_bunch` = tarif × janjang matang; `daily` = tarif. Dikurangi denda
  `MENTAH` × mentah dan `TGKPJG` × tangkai panjang (dari `penalty_rule`).

**Validasi:** pemanen wajib hadir, TPH harus milik blok, blok harus TM, dan tiket tidak boleh kosong.

**Koreksi** = tiket baru bernomor baru dengan `correction_of`. Berlaku juga untuk tiket yang ditolak server. Tiket asal tidak diubah.

**QR tiket** `XSM1|HT|<uuid>|<no>|<blok>|<tph>|<janjang>|<kg>|<tanggal>` dipindai kerani transport di HP lain yang offline.

## Transport / SPB (tahap 6)

`app/(app)/transport/` · `db/repositories/transport.ts` · `lib/escpos.ts` · `lib/printer.ts`

**Membuat SPB:**
- Isi kendaraan, sopir, dan tujuan (PKS sendiri/mitra).
- Tambahkan tiket dengan **pindai QR** (VisionCamera v5 + ML Kit) atau dengan memilih tiket di HP ini.
- Ambil minimal 2 foto muatan.
- Nomor SPB dibuat offline. Total janjang dan kg dijumlahkan dari tiket.

**Aturan tiket:**
- Satu tiket hanya boleh ada di satu SPB aktif.
- **Langsir** (`parent_spb_uuid`) boleh meneruskan tiket dari SPB induk.

**Potensi restan:** tiket hari ini yang belum masuk SPB. Peringatannya berubah merah setelah `restanCutoff` (default 16:00).

**Server:**
- SPB yang memuat tiket yang belum disinkronkan mandor tetap diterima dengan flag `unsynced_ticket`, lalu direkonsiliasi server.
- SPB yang memuat tiket yang sudah ditolak server akan ditolak.

**Printer thermal 58 mm (ESC/POS lewat BLE):**
- Pilih printer di Akun → Printer Bluetooth (scan, pilih, cetak uji).
- Struk SPB dan tiket panen bisa dicetak, termasuk QR.
- Encoder-nya murni dan diuji unit: 32 kolom, ASCII aman, QR `GS ( k`, cut.
- Data dikirim per potongan sesuai MTU.

## Perawatan & material (tahap 7)

`app/(app)/upkeep/` · `db/repositories/upkeep.ts` · `features/upkeep/calc.ts`

**Input perawatan:**
- Pilih kegiatan upkeep dan blok, lalu pekerja hadir.
- Isi HK, ditambah luas realisasi (`per_ha`, maksimal seluas blok) atau jumlah pokok (`per_tree`).
- Foto opsional. Estimasi upah tampil sesuai `wage_basis`.

**Material** mengikuti aturan dosis kegiatan dan dicek langsung saat diisi:
- Batas = `dose_per_ha × realized_ha × (1 + tolerance_pct)`.
- Melebihi batas → `over_dose = true`, catatan wajib diisi, dan item masuk antrean approval asisten.

**Pengiriman:** upkeep dan setiap material adalah transaksi terpisah. Material selalu dikirim sesudah upkeep-nya.

**Server** menghitung ulang dosis, dan menolak material yang melebihi dosis tetapi tidak ditandai over-dose.

## Approval & laporan harian (tahap 8)

**Approval asisten** (`app/(app)/approval.tsx`) bekerja offline:
- Saat sinkron, inbox `GET /approvals` per afdeling disimpan ke tabel lokal `approval_inbox` (migrasi `0004`).
- Asisten memeriksa item berflag: fake GPS, root, waktu tidak terkalibrasi, di luar afdeling, over-dose, susulan, dan lain-lain.
- Keputusan **setujui / minta koreksi / tolak** disimpan sebagai transaksi `approval_decision` dan dikirim saat sinkron.
  Catatan wajib untuk tolak dan koreksi.
- Server hanya menerima keputusan dari peran asisten. Item yang sudah diputuskan hilang dari inbox pada sinkron berikutnya.

**Laporan harian** (`app/(app)/daily-report/`):
- Ringkasan per gang dihitung dari data lokal: kehadiran, penugasan, panen (tiket, janjang, kg, susulan, belum terangkut), dan perawatan (HK, ha, over-dose).
- Mandor/asisten membubuhkan tanda tangan di layar (`react-native-view-shot` → PNG + SHA-256).
- Laporan ulang untuk gang + tanggal yang sama menjadi koreksi laporan sebelumnya.

## NFC kartu pekerja (tahap 9)

`lib/nfc.ts` · `lib/nfc-parse.ts` · `features/nfc/NfcCardButton.tsx`

**Pemakaian:** tombol **Tempel kartu NFC pekerja** ada di layar Absensi (membuka aksi absensi pekerja tsb) dan di tiket panen (memilih pemanen).
Tombol disembunyikan otomatis pada HP tanpa NFC.

**Cara kartu dikenali**, berurutan:
1. **Teks NDEF** `XSM1|EMP|<employee_id>|<nik>`, ditulis di kantor. NIK di kartu harus cocok dengan master.
2. **UID kartu** yang terdaftar di master pekerja, kolom `employee.nfc_uid` (migrasi `0005`).

**Pemetaan kartu milik server:** HP tidak pernah mendaftarkan atau mengubah kartu (prinsip master milik server).
Kartu tidak dikenal atau pekerja nonaktif ditolak dengan pesan yang jelas.

**Mock server:** setiap pekerja dummy punya `nfc_uid` 7 byte, misalnya `04A10001A5B680` untuk pekerja #1.

## Arsitektur

```
src/
  app/             layar expo-router (src/app adalah default SDK 58)
  components/      komponen UI bersama (Txt, Button, Screen, PendingBadge)
  features/<modul>/ komponen, hook, dan skema form per modul (mulai tahap 2)
  db/
    schema/        tabel Drizzle: master.ts, transactions.ts, local.ts
    migrations/    SQL hasil drizzle-kit (+ migrasi custom trigger)
    repositories/  akses data: master (delta), pending, sequence, meta
    client.ts      buka SQLCipher + migrasi
    provider.tsx   DatabaseProvider, useDb, useTableQuery
    tx-status.ts   siklus status transaksi
  sync/contract/   skema zod kontrak /xsm/v1 (dipakai app DAN mock-server)
  lib/             trusted-time, clock, location, geo, guard, device, config, secure-kv, services
  features/auth/   SessionService, store sesi, LoginForm, skema form
  features/menu/   menu per peran
  features/security/ store integritas & hook peringatan
  features/sync/   store status sinkron
  features/attendance/ aksi absensi & penugasan, pilihan gang
  features/camera/ kamera dalam aplikasi
  features/common/ tx-factory (kolom anti-fraud transaksi)
  features/harvest/ kalkulasi panen, QR tiket, aksi simpan
  features/transport/ aksi SPB, struk ESC/POS, pemindai QR, cetak
  features/upkeep/ kalkulasi dosis & upah, aksi simpan
  features/report/ keputusan approval, laporan harian
  features/nfc/    tombol baca kartu NFC pekerja
  sync/            engine, api (SyncApi), api-client, http, background-task, contract
  i18n/id.ts       semua teks UI bahasa Indonesia
  theme/           warna kontras tinggi, target sentuh 56 dp, font 18 sp
mock-server/       Express + tsx, data dummy deterministik (+ test integrasi klien app)
modules/xsm-clock/ modul native lokal: elapsedRealtime + BOOT_COUNT
scripts/           generator trigger append-only
```

### Prinsip yang ditegakkan di kode

- **Offline-first.** Layar hanya membaca dan menulis SQLite lewat `useDb()`, `useLiveQuery`, atau `useTableQuery`.
  API hanya dipanggil oleh sync engine (tahap 3).
- **Database terenkripsi.** Plugin `expo-sqlite` memakai `useSQLCipher: true`. Kuncinya 32 byte acak per instalasi,
  disimpan di `expo-secure-store` (Android Keystore) dan dipasang sebagai raw key (`PRAGMA key = "x'…'"`).
  `allowBackup` dimatikan.
- **Append-only, ditegakkan oleh SQLite.** Migrasi `0001_append_only_guards.sql` (hasil `scripts/gen-guard-triggers.ts`)
  memasang trigger per tabel transaksi:
  - Kolom bisnis hanya bisa diubah selama status `draft`/`queued`.
  - Transisi status harus mengikuti `TX_TRANSITIONS`.
  - Hanya `draft` yang boleh dihapus.
  - Baris `spb_line` terkunci mengikuti SPB induknya.
  - Hash, waktu, dan lokasi foto tidak bisa diubah.

  Koreksi selalu berupa baris baru dengan `correction_of`.
- **Idempoten.** PK transaksi adalah `mobile_uuid` (UUID v4 dari HP). Mock server mengembalikan `duplicate` untuk
  kiriman ulang yang sudah diterima, dan hasil penolakan asal untuk kiriman ulang yang pernah ditolak.
- **Master milik server.** `applyMasterChanges` menerapkan satu halaman delta beserta cursor-nya secara atomik.
  Bila gagal, cursor lama tetap dipakai.
- **Anti-fraud.** Semua tabel transaksi menyimpan `lat`, `lng`, `accuracy_m`, `mocked`, `rooted`, `device_id`,
  `user_id`, `created_trusted_at` (trusted time), dan `device_time_at` (jam HP, untuk audit selisih).
  Permission galeri/storage diblokir di manifest.

Status transaksi: `draft → queued → sent → accepted | rejected → posted`. Status `sent → queued` hanya untuk
kirim ulang setelah gagal jaringan. Header selalu menampilkan **"X data belum terkirim"** (status `queued`/`sent`).

Nomor tiket/SPB offline: `<kode_afdeling>-<yyMMdd>-<device_short>-<seq 4 digit>`, misalnya `AFD01-261018-K3ZQ-0007`.
Nomor urut dialokasikan atomik di tabel `doc_sequence`.

### Kontrak API dan zod

`src/sync/contract` hanya bergantung pada zod, sehingga mock server mengimpornya langsung.
Test `contract.test.ts` memastikan setiap kolom tabel SQLite sama dengan field API:
- master: identik;
- transaksi: kolom = payload + meta + kolom status.

Jadi skema DB dan kontrak tidak bisa diam-diam berbeda.

Tambahan kecil terhadap kontrak awal (perlu dikonfirmasi ke tim backend):
- `GET /master` → `has_more` (opsional, default `false`) untuk paginasi snapshot besar.
- `meta` transaksi → `rooted`, `device_time_at`, `app_version`.
- Payload `spb` → `harvest_ticket_uuids` (isi `spb_line`).
- `POST /approvals` → setiap item punya `mobile_uuid` sendiri agar idempoten.
- `afdeling` → `polygon_geojson` (untuk cek absen di luar afdeling).
- Semua master punya `id` (termasuk `dosage_rule` dan `penalty_rule`) agar delta delete seragam.
- `meta` transaksi → `time_source` (`server` | `device`).
- Master `employee` → `nfc_uid` (opsional) untuk kartu NFC.

## Mock server

`mock-server/` mengimplementasikan seluruh kontrak `/xsm/v1` dengan data dummy deterministik:
1 estate, 3 afdeling, 40 blok, 120 TPH, 200 pekerja, 12 gang, 6 kegiatan, 6 material, aturan dosis,
8 kendaraan, 4 aturan denda, dan rencana kerja 7 hari mulai hari ini.

Akun uji (password: `TEST_PASSWORD` di `mock-server/src/seed.ts`):

| Login | Peran | Afdeling |
|---|---|---|
| `mandor.panen` | mandor_panen | AFD01 |
| `kerani.panen` | kerani_panen | AFD01 |
| `mandor.rawat` | mandor_rawat | AFD01 |
| `kerani.transport` | kerani_transport | AFD01–03 |
| `asisten` | asisten | AFD01 |
| `asisten2` | asisten | AFD02–03 |

Aturan bisnis yang divalidasi server (mencerminkan aturan di HP):
- Pekerja tanpa check-in tidak bisa ditugaskan atau dicatat panennya.
- Satu pekerja hanya check-in di satu gang per hari.
- `est_kg` harus sama dengan janjang × BJR.
- Tiket kedua untuk TPH + pemanen + tanggal yang sama wajib bertanda susulan.
- SPB hanya untuk tiket yang sudah diterima.
- Material hanya untuk perawatan yang sudah diterima.
- Transaksi berflag (`mocked_gps`, `rooted_device`, `outside_afdeling`, `over_dose`, `late_entry`, dll.)
  masuk `GET /approvals` asisten.
- Transaksi `accepted` menjadi `posted` setelah `POST_DELAY_MS` (default 60 detik).

Variabel lingkungan: `PORT` (8080), `ACCESS_TTL_SEC` (3600), `POST_DELAY_MS` (60000).

Endpoint pengembangan (di luar kontrak) untuk menguji sync:

| Endpoint | Fungsi |
|---|---|
| `POST /_dev/reset` | Kembalikan data awal |
| `POST /_dev/master/:entity/:id` (body = patch) | Ubah master → muncul di delta |
| `DELETE /_dev/master/:entity/:id` | Hapus master → muncul di `deletes` |
| `POST /_dev/faults` `{fail_rate, latency_ms}` | Simulasi jaringan buruk / error 503 |
| `POST /_dev/expire-tokens` | Paksa alur 401 → refresh |
| `GET /_dev/state` | Lihat transaksi, foto, approval, heartbeat |

## Catatan versi

- **Expo SDK 58** (React Native 0.88, React 19.3).
- **`expo-background-task`, bukan `expo-background-fetch`.** Paket `expo-background-fetch` sudah deprecated di SDK 58.
  Penggantinya resmi, berbasis WorkManager, dengan interval minimal 15 menit.
- **Drizzle ORM 0.45 (stabil), bukan 1.0 RC**, karena RC bentrok peer dependency dengan jest-expo.
- **VisionCamera v5** berbasis Nitro. Code scanner ada di paket terpisah `react-native-vision-camera-barcode-scanner` (ML Kit).
- `mocked` dari expo-location ada di `location.mocked`, bukan `location.coords.mocked`.
