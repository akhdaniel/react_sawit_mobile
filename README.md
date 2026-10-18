# Xerpium Sawit Mobile

Aplikasi Android lapangan **offline-first** untuk perkebunan kelapa sawit (mandor, kerani, asisten afdeling).
Semua data lapangan disimpan di SQLite terenkripsi di HP dan disinkronkan ke ERP Xerpium (Odoo 18)
melalui REST API `/xsm/v1` saat ada Wi-Fi kantor.

> **Status: Tahap 1 — Fondasi.** Sudah ada: proyek Expo SDK 58, DB lokal terenkripsi + migrasi seluruh skema,
> kontrak API (zod) yang dipakai bersama, trigger append-only, mock server lengkap, dan unit test.
> Login, sinkron, dan modul lapangan dikerjakan di tahap berikutnya.

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

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm test` | Unit test aplikasi (Jest + jest-expo) |
| `npm run test:mock` | Test kontrak mock server (`node:test`) |
| `npm run test:all` | Keduanya |
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint (eslint-config-expo) |
| `npm run db:generate -- --name=<nama>` | Buat migrasi baru dari perubahan skema Drizzle |
| `npm run db:guards -- <file.sql> [--drop]` | Tulis trigger append-only ke migrasi custom |

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
  lib/             utilitas murni (doc-number; trusted-time, guard, dsb. menyusul)
  i18n/id.ts       semua teks UI bahasa Indonesia
  theme/           warna kontras tinggi, target sentuh 56 dp, font 18 sp
mock-server/       Express + tsx, data dummy deterministik
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
