# Panduan Pengguna — Xerpium Sawit Mobile

Aplikasi lapangan untuk mandor, kerani, dan asisten kebun sawit. Semua pekerjaan dicatat di HP **tanpa perlu sinyal**,
lalu dikirim ke Xerpium ERP (Odoo) saat sinkron.

## Daftar isi

1. [Siapa memakai apa](#1-siapa-memakai-apa)
2. [Alur harian end-to-end](#2-alur-harian-end-to-end)
3. [Mulai memakai aplikasi](#3-mulai-memakai-aplikasi)
4. [Panduan per peran](#4-panduan-per-peran)
5. [Sinkron dan status data](#5-sinkron-dan-status-data)
6. [Anti-kecurangan](#6-anti-kecurangan)
7. [Masalah umum](#7-masalah-umum)
8. [Akun uji (mock server)](#8-akun-uji-mock-server)

---

## 1. Siapa memakai apa

**Mandor** memimpin orang dan pekerjaan di lapangan. **Kerani** mencatat hasil dan mengurus administrasi.
**Asisten** memeriksa dan menyetujui.

| Peran | Tugas utama | Menu yang tampil |
|---|---|---|
| Mandor panen | Absen & tugaskan pemanen, buat dan verifikasi tiket panen, laporan harian | Absensi, Penugasan, Panen, Verifikasi tiket, Laporan harian, Sinkron |
| Kerani panen | Catat hasil panen per TPH, verifikasi tiket panen, bantu absensi | Absensi, Panen, Verifikasi tiket, Sinkron |
| Mandor rawat | Absen & tugaskan pekerja rawat, buat dan verifikasi tiket pemupukan dan tiket perawatan, laporan harian | Absensi, Penugasan, Verifikasi tiket, Pemupukan, Perawatan, Laporan harian, Sinkron |
| Kerani rawat | Catat dan verifikasi tiket pemupukan dan tiket perawatan, bantu absensi | Absensi, Verifikasi tiket, Pemupukan, Perawatan, Sinkron |
| Kerani transport | Buat SPB angkut TBS ke PKS (scan QR tiket) | Transport / SPB, Sinkron |
| Asisten | Setujui / tolak / minta koreksi item yang ditandai, laporan harian | Persetujuan, Laporan harian, Sinkron |

Menu ditentukan oleh peran akun yang diatur di ERP. Semua peran juga punya menu **Akun & perangkat**.

## 2. Alur harian end-to-end

```mermaid
flowchart TD
    S1["Server XSM / Odoo<br/>master data, rencana kerja"]:::srv --> A["Mandor: absensi & penugasan<br/>pagi, per kemandoran"]:::hp
    A --> P["Tiket panen<br/>mandor/kerani panen, per TPH"]:::hp
    A --> R["Tiket perawatan<br/>mandor rawat: per pekerja, material"]:::hp
    A --> F["Tiket pemupukan<br/>mandor rawat: per pekerja"]:::hp
    F --> L
    P --> T["SPB angkut<br/>kerani transport: scan QR"]:::hp
    T --> L["Laporan harian<br/>mandor, tanda tangan"]:::hp
    R --> L
    L --> Y["Sinkron ke server<br/>accepted / rejected → koreksi"]:::srv
    Y --> AP["Approval asisten<br/>over-dosis, susulan, luar afdeling"]:::hp
    AP --> E["ERP: posting<br/>timbang PKS, premi, upah"]:::srv
    classDef hp fill:#EEEDFE,stroke:#534AB7,color:#3C3489
    classDef srv fill:#E1F5EE,stroke:#0F6E56,color:#085041
```

Ungu = dikerjakan di HP (bisa offline). Hijau = server / ERP.

1. **Server → HP** (di kantor / Wi-Fi). HP menarik data induk: estate, afdeling, blok, TPH, karyawan, kemandoran,
   kegiatan, aturan dosis, kendaraan. Ikut juga rencana kerja hari ini, antrean approval (asisten), dan antrean
   verifikasi tiket panen (mandor panen, kerani panen).
   Jam server dipakai sebagai patokan waktu tepercaya.
2. **Pagi — mandor.** Absen anak buah (foto + GPS), lalu tugaskan pekerja ke blok sesuai rencana kerja.
3. **Siang — paralel.**
   - Mandor/kerani panen membuat **tiket panen** per TPH × pemanen.
   - Mandor rawat mencatat **perawatan** dan pemakaian material.
4. **Kerani transport** memindai QR tiket ke **SPB**, lalu truk berangkat ke PKS.
5. **Sore — mandor.** Membuat **laporan harian** dan menandatanganinya di layar.
6. **Sinkron.** Data terkirim, lalu server menerima atau menolaknya.
7. **Asisten** memutuskan item yang ditandai. Keputusannya terkirim pada sinkron berikutnya.
8. **ERP** memposting data: berat timbangan PKS dibagi ke tiket/pemanen, lalu dihitung premi dan upah.

Siklus ini berulang setiap hari.

## 3. Mulai memakai aplikasi

### Login pertama (wajib online)

1. Buka aplikasi. Bila server belum benar, ketuk **Pengaturan server** dan isi alamatnya
   (misalnya `http://192.168.1.8:8080/xsm/v1`).
2. Masukkan nama pengguna dan password ERP.
3. Buat **PIN 4–6 angka**.

### Sehari-hari

| Situasi | Yang terjadi |
|---|---|
| Buka aplikasi | Masukkan PIN. Aplikasi jalan penuh tanpa sinyal. |
| Aplikasi di latar belakang > 5 menit | Terkunci, minta PIN lagi |
| PIN salah 5× | Dikunci 30 detik, lalu bertambah lama (60, 120, … detik) |
| PIN salah 10× / lupa PIN | Wajib login online ulang dan buat PIN baru. Data di HP tetap aman. |
| Sesi server habis | Kerja offline tetap jalan; layar Sinkron meminta **Login ulang** (password saja) |
| Ganti akun / keluar | Hanya bisa bila **semua data sudah terkirim** |

### Beranda

- Indikator di atas menunjukkan **"X data belum terkirim"** atau **"Semua data terkirim"**. Ketuk untuk membuka layar Sinkron.
- Banner merah/kuning muncul bila HP di-root, GPS palsu terdeteksi, atau jam HP belum terkalibrasi.

## 4. Panduan per peran

### 4.1 Absensi (mandor, kerani panen, kerani rawat)

Menu **Absensi**, per kemandoran.

| Aksi | Cara |
|---|---|
| Absen masuk semua | Tombol absen semua → isi alasan bila terlambat → foto grup → tersimpan |
| Per pekerja: hadir / terlambat | Ketuk pekerja → pilih status → foto dari kamera aplikasi |
| Per pekerja: sakit / izin / mangkir | Ketuk pekerja → pilih status (tanpa foto) |
| Absen pulang semua | Satu tombol, untuk pekerja yang hadir dan belum pulang |
| Kartu NFC | **Tempel kartu NFC pekerja** untuk langsung membuka absensi pekerja itu |
| Pekerja kemandoran lain | Cari nama / NIK |
| Salah input | Ubah status. Tercatat sebagai koreksi; data lama tidak dihapus. |

**Aturan:**
- Lewat jam masuk (default 06:30) otomatis berstatus **terlambat**, dan alasan wajib diisi.
- Satu pekerja hanya bisa absen di satu kemandoran per hari.
- Absen di luar batas afdeling tetap tersimpan, tetapi ditandai untuk asisten.

### 4.2 Penugasan (mandor)

Menu **Penugasan → Penugasan baru**.

1. Pilih rencana kerja hari ini, atau **Di luar rencana** (pilih kegiatan + blok dan isi alasan).
2. Pilih pekerja. Hanya pekerja yang sudah absen hadir yang bisa ditugaskan.

### 4.3 Panen (mandor panen, kerani panen)

Menu **Panen → Tiket baru**. Cukup tiga langkah:

1. Pilih **TPH**. Blok terisi otomatis dari penugasan atau rencana kerja. Bila blok punya lebih dari satu
   **sub blok**, pilih sub bloknya (kelas medannya menentukan tarif premi); bila hanya satu, terisi otomatis.
2. Pilih **pemanen**. Hanya yang sudah absen hadir; bisa juga dengan menempel kartu NFC.
3. Isi **janjang matang**, lalu **Simpan tiket**, atau **Simpan & Lanjutkan** untuk sekaligus melanjutkan
   tiket ke tahap verifikasi Anda (lihat *Lanjutkan* di bawah).

Rincian lain bersifat opsional: mentah, busuk, janjang kosong, tangkai panjang, brondolan (kg).

**Yang dihitung otomatis:**
- **Estimasi berat** = (matang + mentah + busuk) × BJR blok.
- **Estimasi premi** dari **tarif panen ERP** yang berlaku untuk estate, tipe karyawan pemanen, dan tanggal,
  dengan rumus yang sama dengan tiket panen ERP: tarif per mutu (matang, mentah, tangkai panjang, brondolan, …)
  sesuai kelas medan sub blok; tarif per kg dikali janjang × BJR. Rinciannya tampil di bawah angka premi.
  Premi lebih basis borong dihitung per hari di ERP, tidak di HP. Bila tertulis *belum ada tarif panen aktif*,
  sinkron di kantor atau hubungi asisten.
- **Nomor tiket** dibuat offline, misalnya `AFD01-261018-K3ZQ-0007`.

**Setelah disimpan:**
- Tiket menampilkan **QR** untuk dipindai kerani transport, dan bisa **dicetak** ke printer thermal.
- Tiket kedua untuk TPH + sub blok + pemanen yang sama di hari yang sama otomatis ditandai **Susulan**
  (termasuk bila tiket pertama diinput di ERP).
- Setelah diposting, tiket menampilkan **Dokumen ERP**: nomor tiket panen ERP dan statusnya
  (Draft → Terverifikasi kerani → Ditutup saat rekap upah disetujui).
- Salah input → buka tiket → **Koreksi tiket**. Akan dibuat tiket baru bernomor baru; tiket lama tetap tercatat.

**Lanjutkan** (sama dengan tombol Lanjutkan di form tiket panen ERP):
- Buka tiket → **Lanjutkan**. Saat sinkron, tiket ERP maju satu tahap atas nama Anda:
  Draft → **Verifikasi Mandor** (oleh mandor kemandoran tiket) → **Verifikasi Kerani Panen** (Terverifikasi).
- Kerani yang menekan Lanjutkan sebelum mandor memverifikasi tidak ditolak: Lanjutkan-nya **menunggu**, lalu
  diterapkan otomatis begitu mandor memverifikasi (dari HP atau ERP). Status di tiket:
  *menunggu sinkron* → *menunggu giliran tahap Anda* → *diterapkan*.
- Dua tahap harus oleh dua orang berbeda. Lanjutkan ditolak bila tiket batal, di luar kemandoran/afdeling Anda,
  atau belum ada tarif panen aktif — alasannya tampil di tiket; Lanjutkan boleh diulang setelah masalahnya beres.
- Mengembalikan tahap hanya bisa di ERP (asisten).

**Layar daftar Panen** punya dua tampilan:
- **Per tiket**: setiap tiket dengan status *Terangkut / Belum terangkut*.
- **Per TPH**: total janjang, estimasi kg, brondolan, jumlah tiket & pemanen, dan janjang yang **belum terangkut**
  per TPH. Dipakai untuk memantau potensi restan.

### 4.3a Verifikasi tiket (mandor dan kerani panen/rawat)

Menu **Verifikasi tiket** berisi tiket panen, tiket pemupukan, dan tiket perawatan ERP yang tahap berikutnya milik Anda, **termasuk
tiket dari HP lain** atau yang diinput di ERP (7 hari terakhir), dikelompokkan per jenis tiket:
- **Mandor** (panen/rawat): tiket Draft dari kemandoran Anda, misalnya tiket yang diinput kerani.
- **Kerani** (panen/rawat): tiket yang sudah diverifikasi mandor. Tiket pemupukan dan perawatan diverifikasi
  **kerani rawat**, bukan kerani panen.

Ketuk tiket untuk melihat rinciannya (janjang dan brondolan; pupuk, pokok, dan kg; atau jenis perawatan, hasil
kerja, dan material; serta siapa yang menginput), lalu **Lanjutkan**. Antrean diperbarui setiap sinkron dan bisa dipakai tanpa sinyal; angka di menu beranda = jumlah tiket yang menunggu.
Bila ada yang salah, jangan Lanjutkan — minta penginput membuat **Koreksi tiket**.

### 4.4 Transport / SPB (kerani transport)

Menu **Transport / SPB → SPB baru**.

1. Pilih kendaraan. Truk **sendiri**: pilih **sopir** dari daftar sopir karyawan. Truk **sewa**: ketik nama sopir.
   Pilih **PKS tujuan** dan tujuan (PKS sendiri / mitra).
2. Tambahkan tiket:
   - **Pindai QR** di tiket / HP mandor. Bisa dilakukan meskipun kedua HP offline.
   - Atau pilih dari daftar tiket yang belum terangkut di HP ini.
3. Ambil **minimal 2 foto** muatan.
4. Bila tiket tidak terangkut seluruhnya, ketuk tiket di daftar lalu ubah **janjang/brondolan dimuat**.
   Sisa janjang menjadi restan di TPH.
5. Simpan. Total janjang dan kg dijumlahkan dari muatan, dan nomor SPB dibuat offline.

**Aturan dan catatan:**
- Satu tiket hanya boleh masuk satu SPB aktif.
- **Langsir:** buat SPB lanjutan dari SPB induk, dan isi **titik muat** langsir.
- Setelah diposting, SPB menampilkan **Dokumen ERP**: nomor SPB ERP, status (Berangkat → Diterima PKS),
  dan **netto timbang** PKS.
- Tiket hari ini yang belum masuk SPB adalah **potensi restan**. Peringatannya berubah merah setelah jam batas (default 16:00).
- Struk SPB bisa dicetak beserta QR-nya.

### 4.5 Tiket perawatan (mandor rawat, kerani rawat)

Menu **Perawatan → Tiket perawatan baru**. Satu tiket untuk satu pekerja, sama seperti tiket perawatan di ERP.

1. Pilih **kemandoran rawat**, **blok**, dan **sub blok** (bila blok punya lebih dari satu).
2. Pilih **jenis perawatan** (Semprot gulma, Babat gawangan, Pruning, Kastrasi, dll.). Di bawahnya tertulis
   dasar upahnya: per Ha, per pokok, atau per HK.
3. Pilih **pekerja** yang sudah absen hadir di kemandoran itu.
4. Isi hasil kerja. Kolom sesuai dasar upah tampil paling atas. Luas tidak boleh melebihi luas blok dan pokok
   tidak boleh melebihi pokok blok. HK default 1 dan bisa diubah (mis. 0,5).
5. **Tambah material** (herbisida, pestisida, perata) lalu isi jumlahnya. Batas material = dosis standar per Ha
   × luas. Material berdosis butuh luas diisi. Material yang **melebihi dosis tidak bisa disimpan**, karena ERP
   juga tidak akan bisa memverifikasinya. Pupuk dicatat di menu **Pemupukan**.
6. Cuaca dan catatan opsional. Estimasi upah dihitung dari tarif perawatan ERP.
7. **Simpan & pekerja berikutnya** mempertahankan blok, jenis perawatan, dan material; **Simpan tiket** untuk
   selesai; atau **Simpan & Lanjutkan** untuk menyimpan sekaligus memverifikasi.

Setelah sinkron, tiket masuk ERP sebagai tiket perawatan **Draft** beserta materialnya. Nomor, status, dan tahap
ERP tampil di detail tiket. Verifikasinya sama seperti tiket pemupukan (lihat 4.5a): Draft → **Verifikasi
Mandor** (mandor rawat) → **Verifikasi Kerani** (kerani rawat; Terverifikasi), lewat tombol **Lanjutkan** di
detail tiket atau di menu **Verifikasi tiket**. Saat Verifikasi Kerani, **semua material keluar dari gudang** dan
upah dibekukan, jadi stok setiap material harus cukup dan tarif perawatan harus aktif.

Salah input? Buka tiket lalu **Koreksi tiket**, selama tiket belum Terverifikasi. Setelah material keluar gudang,
tombol Koreksi hilang dan perbaikannya lewat asisten di ERP.

### 4.5a Tiket pemupukan (mandor rawat, kerani rawat)

Menu **Pemupukan → Tiket pemupukan baru**. Satu tiket untuk satu pekerja, sama seperti tiket pemupukan di ERP.

1. Pilih **kemandoran rawat**, **blok**, dan **sub blok** (bila blok punya lebih dari satu).
2. Pilih **pupuk** dan **metode** (Manual, Mekanis, Drone). Dosis standar pupuk tampil di bawahnya.
3. Pilih **pekerja** yang sudah absen hadir di kemandoran itu.
4. Isi **pokok dipupuk** dan **pupuk ditabur (kg)**. Batas pupuk (dosis standar × pokok) dan status dosis
   tampil langsung. Tiket yang **melebihi dosis tidak bisa disimpan**, karena ERP juga tidak akan bisa
   memverifikasinya. Pokok dipupuk juga tidak boleh melebihi jumlah pokok blok.
5. Ronde aplikasi, cuaca, dan catatan bersifat opsional. Estimasi upah dihitung dari tarif pemupukan ERP.
6. Tekan **Simpan & pekerja berikutnya** untuk lanjut ke pekerja lain dengan blok, pupuk, dan metode yang sama,
   **Simpan tiket** untuk selesai, atau **Simpan & Lanjutkan** untuk menyimpan sekaligus memverifikasi.

Setelah sinkron, tiket masuk ERP sebagai tiket pemupukan **Draft**. Nomor, status, dan tahap ERP-nya tampil di
detail tiket. Tahap verifikasinya sama seperti di ERP dan bisa dijalankan dari HP dengan tombol **Lanjutkan**
(di detail tiket atau di menu **Verifikasi tiket**):

Draft → **Verifikasi Mandor** (mandor rawat kemandoran tiket) → **Verifikasi Kerani** (kerani rawat; Terverifikasi).

Saat Verifikasi Kerani, pupuk keluar dari gudang dan upah dibekukan, jadi stok gudang pupuk harus cukup dan tarif
pemupukan harus aktif. Kalau tidak, Lanjutkan kerani ditolak dengan alasannya. Lanjutkan kerani yang dikirim
sebelum mandor memverifikasi akan **menunggu**, lalu diterapkan otomatis begitu mandor melanjutkan. Verifikasi
mandor dan kerani harus oleh orang yang berbeda.

Salah input? Buka tiket lalu **Koreksi tiket**: tiket baru dikirim dan tiket ERP yang lama dibatalkan. Koreksi
hanya bisa selama tiket belum Terverifikasi. Setelah pupuk keluar gudang, tombol Koreksi hilang dan perbaikannya
lewat asisten di ERP.

### 4.6 Laporan harian (mandor, asisten)

Menu **Laporan harian → Buat laporan**.

1. Ringkasan per kemandoran terisi otomatis dari data hari ini:
   - kehadiran dan penugasan
   - panen: tiket, janjang, kg, susulan, belum terangkut
   - perawatan: HK, ha, over-dosis
2. Bubuhkan **tanda tangan** di layar, lalu simpan.

Membuat ulang laporan untuk kemandoran + tanggal yang sama dianggap koreksi laporan sebelumnya.

### 4.7 Persetujuan (asisten)

Menu **Persetujuan**. Antrean diambil saat sinkron, lalu bisa diperiksa **offline**.

1. Periksa item yang ditandai: GPS palsu, HP root, jam tidak terkalibrasi, di luar afdeling, over-dosis, susulan, dan lain-lain.
2. Putuskan: **Setujui**, **Minta koreksi**, atau **Tolak**. Catatan wajib untuk tolak dan koreksi.
3. Keputusan terkirim saat sinkron berikutnya, dan item hilang dari antrean.

### 4.8 Akun & perangkat (semua peran)

- **Alamat server**: ubah tanpa logout. Gunakan **Uji koneksi**, lalu **Simpan & sinkron**.
- **Printer Bluetooth**: scan, pilih printer thermal 58 mm, lalu cetak uji.
- **Keluar**: hanya bisa bila semua data sudah terkirim.

## 5. Sinkron dan status data

**Kapan sinkron berjalan:**
- **Manual:** menu **Sinkron → Sinkron sekarang**, atau ketuk indikator di beranda.
- **Tarik layar ke bawah** di beranda, daftar, dan detail (tidak di form isian): sinkron yang sama, lewat jaringan
  apa pun termasuk data seluler. Paling cepat sekali per 10 detik; hasilnya tampil sebagai pesan singkat.
- **Otomatis:** saat tersambung Wi-Fi dan ada data belum terkirim.
- **Latar belakang:** kira-kira tiap jam, hanya lewat Wi-Fi.

**Satu kali sinkron mengerjakan, berurutan:**
1. Kirim transaksi.
2. Unggah foto.
3. Ambil status transaksi.
4. Perbarui data induk dan rencana kerja.
5. Kirim laporan kondisi HP.

**Status data:**

| Status | Arti |
|---|---|
| Draft / Antre | Tersimpan di HP, menunggu dikirim |
| Terkirim | Sudah dikirim; menunggu kepastian dari server |
| Diterima | Server menerima data |
| Ditolak | Server menolak; alasannya tampil. Buat **koreksi** (data baru), bukan mengubah yang lama. |
| Diposting | Sudah dibukukan di ERP. Tiket panen dan SPB lalu menampilkan **Dokumen ERP** (nomor, status ERP, netto timbang) yang terus diperbarui saat sinkron selama 14 hari. |

Data yang sudah terkirim **tidak bisa diubah atau dihapus**. Perbaikan selalu berupa data koreksi baru,
sehingga riwayatnya bisa diaudit.

## 6. Anti-kecurangan

- **Foto** hanya bisa diambil dari kamera aplikasi; galeri tidak bisa dipakai. Setiap foto diberi sidik digital (SHA-256).
- **Lokasi GPS** dicatat di setiap transaksi. Lokasi palsu (*mock location*) terdeteksi dan ditandai.
- **Waktu** memakai jam server, bukan jam HP. Mengubah jam HP tidak berpengaruh.
  Setelah HP di-restart, waktu ditandai "belum terkalibrasi" sampai sinkron berikutnya.
- **HP root / emulator** terdeteksi dan ditandai.

Aplikasi **tidak memblokir** pekerjaan. Transaksi tetap tersimpan, tetapi diberi tanda dan masuk antrean asisten.

## 7. Masalah umum

| Masalah | Solusi |
|---|---|
| "Tidak terhubung ke server" saat sinkron | Pastikan HP satu jaringan dengan server. Cek **Akun & perangkat → Alamat server → Uji koneksi**. |
| Layar Sinkron minta **Login ulang** | Sesi server habis. Isi password (dan nama pengguna bila diminta). Data offline tidak hilang. |
| Pemanen / pekerja tidak muncul di daftar | Pekerja belum absen hadir hari ini. Lakukan absensi dulu. |
| Blok / TPH / pekerja baru tidak ada | Data induk belum terbaru. Lakukan sinkron di kantor. |
| Tidak bisa keluar / ganti akun | Masih ada data belum terkirim. Sinkron dulu. |
| Banner "Jam belum terkalibrasi" | Lakukan sinkron sekali saat ada koneksi. |
| Tombol NFC tidak ada | HP tidak punya NFC atau NFC dimatikan di pengaturan HP. |
| Menu Transport / SPB tidak ada | Menu hanya untuk peran kerani transport. Login dengan akun tersebut. |

## 8. Akun uji (mock server)

Untuk uji coba dengan `mock-server`. Semua akun memakai password uji yang sama, yaitu konstanta `TEST_PASSWORD`
di `mock-server/src/seed.ts`.

| Login | Nama | Peran | Afdeling |
|---|---|---|---|
| `mandor.panen` | Slamet Riyadi | Mandor panen | 1 |
| `kerani.panen` | Rina Marlina | Kerani panen | 1 |
| `mandor.rawat` | Joko Susilo | Mandor rawat | 1 |
| `kerani.rawat` | Wulan Sari | Kerani rawat | 1 |
| `kerani.transport` | Dedi Kurniawan | Kerani transport | 1, 2, 3 |
| `asisten` | Ir. Hendra Gunawan | Asisten | 1 |
| `asisten2` | Siti Aminah | Asisten | 2, 3 |

**Uji lewat kabel USB:**
1. Jalankan `adb reverse tcp:8080 tcp:8080`.
2. Isi alamat server `http://localhost:8080/xsm/v1`.

Tangkapan layar setiap menu ada di [`docs/screenshots/`](screenshots/).
