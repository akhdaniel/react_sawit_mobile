# Prompt Vibecoding — Modul Inspeksi & Fitur Lanjutan Xerpium Sawit

Disusun 22 Nov 2026 dari analisa dua repo:

- Odoo 18: `/Users/daniel/data/odoo-docker-new/18.0/addons/sawit` (branch `gab`)
- Aplikasi: `/Volumes/Extreme Data/react_sawit_mobile` (Expo SDK 58, app 0.9.9)

Cara pakai: buka sesi Claude Code di kedua repo (atau satu sesi dengan kedua folder), tempel **Prompt Konteks**,
lalu jalankan prompt bertahap I-1 … I-6. Prompt F-1 … F-7 (fitur lanjutan) bisa dijalankan terpisah setelahnya.

---

## Hasil analisa: modul inspeksi BELUM ADA

Tidak ada modul inspeksi lapangan (QC kebun) di Odoo maupun di aplikasi. Yang sudah ada dan bisa dipakai ulang:

| Komponen existing | Lokasi | Dipakai ulang untuk |
|---|---|---|
| `xerpium.sensus.line` (sensus pokok per blok, `action_approve` meng-update `xerpium.blok`) | `xerpium_plantation/models/sensus.py` | Inspeksi jenis **sensus** diposting jadi sensus line draft |
| `xerpium.tree.inspection` + `xerpium.tree.treatment` (inspeksi kesehatan per pohon, hama/penyakit, foto, follow-up) | `xerpium_tree_tracking/models/tree_health.py` | Temuan **hama/penyakit** per pokok bila pohon terdaftar (`xerpium.palm.tree`, baris/kolom/QR) |
| `xerpium.nonconformance` (CAPA: root cause, corrective/preventive action, PIC, due date, state) + cron `qc_alert` NC overdue | `xerpium_quality/models/` | Temuan **major/critical** jadi NC, otomatis ikut alert overdue |
| `xerpium.harvest.plan` (rencana basis/BJR/tonase per blok-bulan) | `xerpium_plantation/models/harvest.py` | Pembanding hasil **taksasi** |
| `xerpium.afdeling.assistant_id` | `xerpium_sawit/models/afdeling.py` | Default PIC tindak lanjut temuan |
| Framework mobile: `xsm.tx.inbox`, `xsm.tx.mixin` (append-only), `PAYLOAD_SPECS`, `_rule_<type>`, `_create_typed`, `POST_ORDER` + `_post_<type>`, `xsm.master.mixin` + `MASTER_ENTITIES`, `backend_entry`, approval asisten, flags | `xerpium_sawit_mobile/models/` | Tipe transaksi baru `inspection` & `inspection_followup`, master template checklist |
| App: kontrak zod `src/sync/contract/*`, `TX_PUSH_ORDER` (`db/repositories/outbox.ts`), `makeTxCommon` (`features/common/tx-factory.ts`), `CameraCapture`, `lib/geo.ts` (point-in-polygon), `scripts/gen-guard-triggers.ts`, `MENU` per peran, mock-server `rules.ts` | `react_sawit_mobile/src` | Layar & transaksi inspeksi mengikuti pola modul perawatan (`upkeep`) |

## Fitur lain yang masih kurang (dibanding eKSI / DigiPlant / KebunPRO)

| # | Fitur | Kondisi sekarang | Prompt |
|---|---|---|---|
| 1 | Inspeksi & QC lapangan (taksasi, mutu panen/ancak, mutu rawat, sensus, hama-penyakit, infrastruktur) | Belum ada | I-1 … I-6 |
| 2 | Foto bukti tampil di form transaksi Odoo | Hanya di menu Foto Bukti (open item #5 DEV_HANDOFF) | F-1 |
| 3 | Ganti server saat ada data pending / beda user | Re-login gagal (open item #4) | F-2 |
| 4 | Peta blok & aktivitas (GIS) | Hanya cek poligon | F-3 |
| 5 | Jejak mandor & tracking kendaraan dari HP | Koordinat per transaksi; `xerpium.vehicle.trip/tracking.point` ada di backend tapi tidak dipakai HP | F-4 |
| 6 | Permintaan material gudang afdeling | Belum ada | F-5 |
| 7 | Tiket panen NFC (paperless) | NFC hanya kartu pekerja | F-6 |
| 8 | Ringkasan read-only untuk asisten/manajer di HP | Belum ada | F-7 |

---

## PROMPT KONTEKS (tempel sekali di awal sesi)

```
Kamu senior engineer Odoo 18 + React Native (Expo SDK 58). Ada dua repo yang saling terkait:

1. Odoo addons: /Users/daniel/data/odoo-docker-new/18.0/addons/sawit (branch gab)
   - xerpium_sawit (estate, afdeling, blok), xerpium_plantation (panen, pemupukan, perawatan, sensus),
     xerpium_quality (lab, non-conformance, qc alert), xerpium_tree_tracking (pohon, inspeksi pohon, nursery),
     xerpium_hr_plantation (premi, borongan), xerpium_mill, xerpium_integration (weighbridge, vehicle tracking),
     xerpium_sawit_mobile (bridge REST /xsm/v1 untuk aplikasi).
2. Aplikasi Android: /Volumes/Extreme Data/react_sawit_mobile (Expo SDK 58, RN 0.88, drizzle + SQLCipher).

WAJIB baca dulu sebelum menulis kode:
- react_sawit_mobile/AGENTS.md, README.md, docs/DEV_HANDOFF.md
- xerpium_sawit_mobile/models/{transactions,sync_service,posting,master,backend_entry}.py dan tests/common.py
- react_sawit_mobile/src/sync/contract/*.ts, src/db/schema/*.ts, src/db/repositories/{upkeep,outbox}.ts,
  src/app/(app)/upkeep/new.tsx, src/features/menu/menu.ts, mock-server/src/rules.ts,
  scripts/gen-guard-triggers.ts

Aturan yang tidak boleh dilanggar (sama dengan modul yang sudah ada):
- Offline-first; API hanya dipanggil dari src/sync/engine.ts.
- Append-only + idempoten per mobile_uuid; koreksi = transaksi baru dengan correction_of.
- Kontrak payload IDENTIK di tiga tempat: zod (app), PAYLOAD_SPECS (Odoo), rules.ts (mock-server).
- Aturan bisnis dicek dua kali: di HP (repository) dan di server (_rule_<type>).
- Transaksi berpenanda (flags) menunggu approval asisten sebelum diposting.
- Pakai ulang model Odoo yang sudah ada; jangan duplikasi konsep (sensus, tree inspection, nonconformance).
- Semua teks UI bahasa Indonesia lewat src/i18n/id.ts; komponen UI pakai yang ada di src/components.
- Pakai `npx expo install` untuk dependensi; jangan edit android/ manual.
- Jangan sentuh DB sawit/sawit2/sawit3; uji di sawit_mobile_test. Jangan commit/push kecuali diminta.
- Sebelum selesai: Odoo tests hijau (--test-tags), app `npx tsc --noEmit`, `npx eslint`, `npx jest`, `npm run test:mock`.
Kerjakan per tahap, tampilkan ringkasan perubahan + hasil test di akhir tiap tahap.
```

---

## PROMPT I-1 — Odoo: modul domain `xerpium_plantation_inspection`

```
Buat addon baru xerpium_plantation_inspection (depends: xerpium_sawit, xerpium_plantation, hr, mail).
Ini modul DOMAIN (bisa dipakai tanpa HP), mengikuti gaya kode xerpium_plantation.

Model:
1. xerpium.inspection.template (master checklist)
   name, code (unik), inspection_type selection:
     taksasi | mutu_panen | mutu_rawat | sensus | hama_penyakit | infrastruktur | umum
   sample_unit selection: pokok | ancak | tph | blok | titik
   default_sample_size (int), pass_score_pct (float, default 80), active,
   item_ids One2many -> xerpium.inspection.item
2. xerpium.inspection.item
   template_id, sequence, code, name, value_type selection: count | number | bool | score_1_5 | select | text,
   select_options (char, dipisah |), uom (char), weight (float, default 1),
   bad_when selection: gt | lt | true | false | in, threshold (float), threshold_text (char),
   finding_category (selection, lihat no.5), required (bool)
3. xerpium.inspection (header, mail.thread)
   name (sequence INS/%(y)s/####), inspection_date, inspection_type (related template, store),
   template_id, blok_id, afdeling_id/estate_id/company_id (related store), tph_id (Many2one optional,
   model 'xsm.tph' TIDAK boleh direferensikan di modul ini -> simpan tph_ref Char), inspector_id (hr.employee),
   harvester_employee_id (opsional, untuk mutu panen per pemanen), mandor_employee_id (opsional),
   sample_size, line_ids, finding_ids, score_pct (compute store), result selection pass|fail (compute store),
   state draft|done|cancelled, source selection backend|mobile, mobile_uuid (char, index), notes, photo attachments.
   Field khusus per jenis (boleh kosong untuk jenis lain):
     taksasi: sampled_trees, ripe_bunches_counted, akp_pct (compute = ripe/sampled*100),
              est_bunches_next (compute = akp × blok.tree_count_productive / 100),
              est_kg_next (compute = est_bunches_next × BJR blok), harvest_date_target
     sensus: tree_count_productive, tree_count_sisipan, tree_count_dead, tree_count_abnormal, sensus_line_id
4. xerpium.inspection.line: inspection_id, item_id, value_num, value_bool, value_text, is_bad (compute),
   weighted_score (compute). Rumus skor: score_pct = 100 × Σ(weight × ok) / Σ(weight) untuk item non-text;
   score_1_5 dinormalisasi (nilai-1)/4.
5. xerpium.inspection.finding (mail.thread) — temuan yang perlu tindak lanjut
   name (sequence TMN/####), inspection_id, blok_id (related store), category selection:
     brondolan_tinggal | buah_mentah_dipanen | buah_matang_tinggal | pelepah_tidak_disusun | tangkai_panjang |
     piringan_kotor | gawangan_kotor | pupuk_tidak_tepat | hama | penyakit | pokok_mati | pokok_abnormal |
     infrastruktur_rusak | lainnya
   severity minor|major|critical, description, row_no, tree_no, palm_tree_qr (char), lat, lng,
   photo attachment_ids, pic_id (default afdeling.assistant_id), due_date (default +3 hari untuk major,
   +1 hari critical), state open|in_progress|done|verified|cancelled, followup_ids, mobile_uuid.
6. xerpium.inspection.followup: finding_id, action_date, action_text, done (bool), employee_id,
   photo attachment_ids, mobile_uuid.

Perilaku:
- action_done pada inspeksi: validasi item required terisi; jenis sensus -> buat xerpium.sensus.line DRAFT
  (REUSE, jangan ubah blok langsung; approval sensus tetap lewat action_approve yang sudah ada).
- Finding dengan followup done=True -> state done; asisten bisa action_verify -> verified.
- Cron harian: finding melewati due_date -> activity ke pic_id.
- Report PDF: laporan inspeksi (header, skor, item, temuan + foto), rekap mutu per afdeling/blok/mandor.
- Views: form/list/pivot/graph untuk inspeksi; kanban temuan per state; menu "Inspeksi & QC" di bawah menu
  Plantation (Template, Inspeksi, Temuan, Taksasi vs Realisasi).
- Laporan "Taksasi vs Realisasi": SQL view/model readonly yang membandingkan est_kg_next dengan
  xerpium.harvest.actual (actual_tonnage) pada blok + harvest_date_target; tampilkan akurasi %.
- Security: grup user/manager/readonly mengikuti xerpium_sawit (group_xerpium_*), record rule per company.
- Data: template default untuk tiap jenis (mis. Mutu Panen: brondolan tinggal di piringan (count, bad gt 0),
  buah mentah di TPH (count), pelepah tidak disusun (bool), tangkai panjang (count); Taksasi; Mutu Rawat:
  piringan bersih (score_1_5), gawangan (score_1_5), pupuk tersebar merata (bool); Hama-Penyakit; Infrastruktur).
- Tests (TransactionCase): skor & result, AKP/taksasi, sensus -> sensus line draft, due date default,
  followup menutup temuan, rekap taksasi vs realisasi.
```

## PROMPT I-2 — Odoo: bridge opsional ke Quality & Tree Tracking (auto_install)

```
Buat dua addon kecil auto_install agar modul inspeksi tidak memaksa dependensi berat:

A. xerpium_plantation_inspection_quality (depends: xerpium_plantation_inspection, xerpium_quality, auto_install True)
   - Inherit xerpium.nonconformance: tambah source_inspection_id, source_finding_id; source_type sekarang related
     ke lab sample — ubah agar compute: 'field_inspection' bila dari temuan, selain itu dari sample
     (pastikan laporan NC existing tidak rusak; tambah test regresi).
   - Temuan severity major/critical yang dibuat/di-done-kan -> buat NC (description dari temuan, severity sama,
     pic_id = finding.pic_id, due_date sama). Satu temuan maksimal satu NC.
   - Followup done -> NC.action_mark_action_taken(); finding verified -> NC.action_close().
   - Cron qc_alert NC overdue existing otomatis berlaku (jangan buat alert baru).
B. xerpium_plantation_inspection_tree (depends: xerpium_plantation_inspection, xerpium_tree_tracking, auto_install True)
   - Temuan kategori hama/penyakit/pokok_mati/pokok_abnormal: cari xerpium.palm.tree berdasar palm_tree_qr,
     atau (blok_id, row_no -> row_number, tree_no -> column_number). Bila ketemu, buat xerpium.tree.inspection
     (inspection_type pest_monitoring/disease_monitoring, health_status sesuai severity, foto pertama ke photo_1)
     dan tautkan finding.tree_inspection_id. Bila tidak ketemu, tidak error.
Tests untuk keduanya.
```

## PROMPT I-3 — Odoo: tipe transaksi mobile `inspection` & `inspection_followup`

```
Buat addon xerpium_sawit_mobile_inspection (depends: xerpium_sawit_mobile, xerpium_plantation_inspection,
auto_install True). JANGAN ubah logika inti xerpium_sawit_mobile kecuali menambah titik ekstensi kecil
yang diperlukan (mis. membuat TX_TYPES/PAYLOAD_SPECS/POST_ORDER/MASTER_ENTITIES bisa di-extend dari modul lain);
bila perlu refactor, lakukan minimal dan semua 32 test lama harus tetap hijau.

1. Master baru untuk HP (inherit xsm.master.mixin, masuk MASTER_ENTITIES setelah 'work_plan'):
   - inspection_template -> xerpium.inspection.template  payload {id, code, name, inspection_type, sample_unit,
     default_sample_size, pass_score_pct}
   - inspection_item -> xerpium.inspection.item payload {id, template_id, sequence, code, name, value_type,
     select_options[], uom, weight, bad_when, threshold, threshold_text, finding_category, required}
   - open_finding -> xerpium.inspection.finding dengan domain state in (open,in_progress) dan afdeling pengguna,
     payload {id, mobile_uuid, blok_id, category, severity, description, row_no, tree_no, due_date, pic_employee_id}
     (agar mandor bisa menindaklanjuti offline).
2. Role baru group_xsm_inspektur ("Inspektur/QC") di kategori Xerpium Sawit Mobile; tambahkan ke _xsm_roles
   sebagai 'inspektur'. Asisten dan mandor juga boleh membuat inspeksi.
3. PAYLOAD_SPECS:
   inspection: {
     work_date: date, inspection_type: enum taksasi|mutu_panen|mutu_rawat|sensus|hama_penyakit|infrastruktur|umum,
     template_id: id, block_id: id, tph_id: id?, harvester_employee_id: id?, gang_id: id?, sample_size: count,
     lines: list(object) item {item_id:id, value_num:num?, value_bool:bool?, value_text:str?},
     findings: list(object) item {finding_uuid:uuid, item_id:id?, category:str1, severity:enum minor|major|critical,
       description:str1, row_no:count?, tree_no:count?, palm_tree_qr:str?, lat:lat?, lng:lng?, photo_ids:list:uuid},
     taksasi: object? {sampled_trees:count, ripe_bunches_counted:count, harvest_date_target:date},
     sensus: object? {tree_count_productive, tree_count_sisipan, tree_count_dead, tree_count_abnormal: count},
     score_pct: num_nn, photo_ids: list:uuid }
   inspection_followup: { finding_ref: str1 (finding_uuid ATAU "id:<server id>"), action_text: str1,
     done: bool, photo_ids: list:uuid }
   Tambah dukungan kind 'list:object' di _check bila belum ada, dengan validasi spec per item.
4. _rule_inspection: blok/template/TPH/pemanen ada; template.inspection_type == inspection_type; template aktif;
   item_id milik template; item required terisi; taksasi wajib objek taksasi bila jenis taksasi
   (sampled_trees > 0, ripe <= sampled_trees × 10); sensus wajib objek sensus bila jenis sensus;
   finding_uuid unik global; HITUNG ULANG score_pct di server (toleransi 0.5) -> tolak 'score_mismatch';
   mutu_panen dengan harvester_employee_id wajib pemanen sudah check-in hari itu (pakai _checked_in).
   Flags: major_finding, critical_finding, low_score (score < pass_score_pct), outside_block
   (lat/lng di luar polygon blok bila polygon ada; pakai util polygon yang ada di master.py atau buat di util).
   Hanya critical_finding yang wajib approval asisten (atur agar flag lain informatif: tambah daftar
   INFO_FLAGS yang tidak membuat approval_state pending).
5. _rule_inspection_followup: finding_ref ditemukan (uuid di finding ATAU id server); finding belum verified/cancelled.
6. Typed model xsm.inspection (inherit xsm.tx.mixin) + xsm.inspection.followup; simpan lines/findings sebagai
   JSON readonly + link ke record domain hasil posting.
7. Posting (_post_inspection): buat xerpium.inspection (source=mobile, mobile_uuid) + lines + findings
   (finding.mobile_uuid = finding_uuid, foto dari xsm.photo -> attachment), lalu action_done
   (sensus otomatis jadi sensus line draft; temuan major/critical otomatis jadi NC bila bridge quality terpasang).
   _post_inspection_followup: buat followup, update state temuan. POST_ORDER: setelah 'material_usage',
   sebelum 'daily_report'; followup setelah inspection.
8. Foto: photo_ids temuan & inspeksi memakai mekanisme /photos yang sama (transaction_uuid = mobile_uuid inspeksi).
9. backend_entry: form entri inspeksi dari Odoo menghasilkan payload yang sama (backend=True).
10. Approval inbox: summary "Inspeksi <jenis> blok <kode>: skor X%, N temuan (K kritis)".
11. Tests (pakai XsmCase): idempoten, template mismatch ditolak, score_mismatch, taksasi & sensus diposting,
    critical menunggu asisten lalu diposting setelah approve, followup menutup temuan, master delta berisi
    template/item/open_finding, kontrak snapshot.
Update docs/DEV_HANDOFF.md di repo app (bagian Odoo) setelah selesai.
```

## PROMPT I-4 — App: skema lokal, kontrak, outbox, mock server

```
Di react_sawit_mobile, tambahkan fondasi inspeksi mengikuti pola upkeep:
1. Kontrak zod (src/sync/contract/transactions.ts & master.ts): inspectionPayloadSchema dan
   inspectionFollowupPayloadSchema PERSIS sama dengan PAYLOAD_SPECS Odoo (I-3); master inspection_template,
   inspection_item, open_finding; Role tambah 'inspektur'. Tambah ke txPayloadSchemas, txItemSchema, TX_TYPE_NAMES.
2. Skema drizzle:
   - master: inspection_template, inspection_item, open_finding (master milik server, ikut delta + tombstone).
   - transaksi: inspection (kolom txColumns() + work_date, inspection_type, template_id, block_id, tph_id,
     harvester_employee_id, gang_id, sample_size, lines json, taksasi json, sensus json, score_pct, photo_ids json)
     dan inspection_finding (anak lokal: finding_uuid PK, inspection_uuid, item_id, category, severity,
     description, row_no, tree_no, palm_tree_qr, lat, lng, photo_ids json) -> ikut dikirim di payload inspection,
     serta inspection_followup (txColumns + finding_ref, action_text, done, photo_ids json).
   - `npm run db:generate -- --name=inspection`, lalu migrasi custom untuk trigger append-only via
     `npx tsx scripts/gen-guard-triggers.ts <file.sql>` (pastikan transactionTables memuat tabel baru).
   - Test migrasi (db/__tests__/migrations.test.ts) & append-only untuk tabel baru.
3. Outbox: TX_PUSH_ORDER sisipkan 'inspection' dan 'inspection_followup' setelah 'material_usage',
   sebelum 'daily_report'; bangun payload inspection dengan findings dari tabel anak.
4. Repository src/db/repositories/inspection.ts:
   - validateInspection (sama dengan aturan server: item required, tipe cocok, taksasi/sensus wajib,
     pemanen sudah check-in untuk mutu panen), computeScore (rumus sama dengan Odoo I-1, unit test dengan
     fixture identik dengan test Odoo), computeTaksasi (AKP, est janjang, est kg dari BJR blok).
   - createInspection (transaksi DB atomik: header + findings), createFollowup, koreksi (correction_of).
   - listOpenFindings (gabungan open_finding master + temuan lokal yang belum tersinkron).
5. mock-server: rules.ts + store untuk dua tipe baru (aturan & flags identik dengan Odoo), seed template default,
   test di mock-server/src/app.test.ts dan sync-integration.test.ts.
6. Fixtures test (src/test/fixtures.ts) untuk template + item.
Jalankan typecheck, lint, jest, test:mock.
```

## PROMPT I-5 — App: layar inspeksi (UI sederhana, ≤ 3 ketukan per item)

```
Buat layar inspeksi dengan komponen yang sudah ada (Screen, Card, ListRow, NumberStepper, Chip, Sheet, Button,
TextField, CameraCapture, EntryPhotos, SavedEntryNotice, PendingBadge) dan tema Xerpium Violet.

Menu: tambah 'inspection' (ikon 'clipboard-check-outline') untuk roles inspektur, asisten, mandor_panen,
mandor_rawat; dan 'findings' (ikon 'alert-circle-check') untuk asisten, mandor_panen, mandor_rawat, inspektur.

Rute:
- /inspection           daftar inspeksi hari ini + filter jenis, status sinkron per baris.
- /inspection/new       alur 3 langkah dengan progress:
    1) Pilih jenis (grid kartu besar 7 jenis) -> template otomatis bila hanya satu.
    2) Pilih blok (urut terdekat dari GPS; tampilkan kode, umur, status TM/TBM), lalu opsional TPH / pemanen
       (mutu panen) / kemandoran.
    3) Checklist: satu kartu per item; count & number pakai NumberStepper, bool pakai dua tombol besar
       Ya/Tidak, score_1_5 pakai 5 chip, select pakai chip, text pakai TextField. Item yang "buruk"
       (sesuai bad_when/threshold) berubah merah dan menampilkan tombol "+ Temuan" yang sudah terisi kategori.
       Tombol "+ Temuan" umum di bawah: kategori, tingkat (minor/major/kritis), deskripsi singkat,
       baris & nomor pokok (opsional), foto wajib untuk major/kritis, lokasi otomatis.
       Jenis taksasi: input pokok sampel & janjang matang, tampilkan live AKP %, est janjang & est kg besok.
       Jenis sensus: 4 NumberStepper (produktif, sisipan, mati, abnormal) dengan pembanding nilai di master blok.
    Footer: skor live (%) + LULUS/TIDAK LULUS + "Simpan Inspeksi". Setelah simpan -> SavedEntryNotice.
- /inspection/[id]       read-only (pola harvest/[id].tsx) + "Lihat form entry".
- /findings              daftar temuan terbuka (master open_finding + lokal), urut kritis lalu jatuh tempo;
                         tap -> detail + tombol "Tindak Lanjut": teks aksi, selesai Ya/Tidak, foto -> createFollowup.
Semua teks di src/i18n/id.ts. Bekerja penuh di mode pesawat. Test komponen/aksi utama (features/inspection/__tests__).
Ambil screenshot layar baru ke docs/screenshots (lanjutkan penomoran) dan update docs/PANDUAN_PENGGUNA.md.
```

## PROMPT I-6 — Uji ujung-ke-ujung & dokumentasi

```
1. Odoo sawit_mobile_test: upgrade -i xerpium_plantation_inspection,xerpium_plantation_inspection_quality,
   xerpium_plantation_inspection_tree,xerpium_sawit_mobile_inspection; seed template default + user inspektur
   (password dari seed, jangan tampilkan di chat).
2. Skrip contract check (tsx dari mock-server/) memanggil semua endpoint termasuk master baru dan memvalidasi
   respons dengan zod app.
3. Skenario: inspektur buat inspeksi mutu panen dengan 1 temuan kritis + foto (offline) -> sinkron ->
   asisten approve dari HP -> posting -> NC terbentuk -> mandor tindak lanjut dari HP -> temuan done ->
   asisten verify di Odoo -> NC closed. Taksasi hari ini -> besok realisasi panen -> laporan akurasi.
4. Update README (Tahap 10: Inspeksi & QC), DEV_HANDOFF, bump versi app (app.json + build.gradle bersamaan).
```

---

## PROMPT FITUR LANJUTAN

### F-1 — Foto bukti tampil di form transaksi Odoo
```
Di xerpium_sawit_mobile: tambahkan computed One2many/Many2many photo_ids (xsm.photo) di xsm.tx.mixin berdasar
transaction_uuid = name, lalu tampilkan galeri thumbnail (widget many2many_binary / image kanban) di form semua
tipe transaksi dan di xsm.tx.inbox. Juga tampilkan foto di xerpium.harvest.actual / maintenance.activity hasil
posting (smart button "Foto Lapangan"). Test: foto muncul setelah upload.
```

### F-2 — Ganti server/akun dengan aman
```
App: blok ganti server bila ada transaksi queued/sent atau foto pending (tampilkan jumlah + tombol Sinkron);
saat ganti server: hapus sesi (token, PIN tetap diminta ulang), master, cursor, approval inbox, open_finding.
Login dengan user id berbeda di HP yang masih punya data milik user lain -> tolak dengan pesan jelas;
bila tidak ada data pending -> izinkan dan bersihkan data lokal user lama. Unit test session-service.
```

### F-3 — Peta blok & aktivitas (GIS)
```
App: tambah layar /map memakai react-native-maps (cek kompatibilitas SDK 58 via docs, `npx expo install`),
layer poligon blok/afdeling dari master (polygon_geojson), titik TPH, titik transaksi hari ini (absen, tiket,
SPB, inspeksi, temuan) berwarna per jenis; tile offline: dukung MBTiles lokal opsional, fallback peta polos
(poligon saja) tanpa internet. Odoo: tambah view peta (OWL + Leaflet, aset lokal) di menu Mobile: blok berwarna
status panen hari ini (sudah/belum/restan) dan titik temuan terbuka. Tanpa API key berbayar.
```

### F-4 — Jejak mandor & kendaraan dari HP (reuse xerpium_integration)
```
App: opsi per peran (kerani_transport wajib saat SPB aktif, mandor opsional) merekam titik lokasi tiap 60 detik
/ 50 m via expo-location background (foreground service, hemat baterai), disimpan lokal, dikirim sebagai tipe
transaksi baru 'track_batch' {vehicle_id?, spb_uuid?, points:[{t,lat,lng,acc,speed}]}.
Odoo: posting ke xerpium.vehicle.trip + xerpium.vehicle.tracking.point yang SUDAH ADA (purpose tbs_transport,
related_receipt_id dari SPB bila cocok). Deteksi berhenti > 15 menit di luar TPH/PKS dan celah sinyal > 20 menit
-> flag ke asisten. Persetujuan privasi pekerja dicatat. Tests di kedua repo.
```

### F-5 — Permintaan material gudang afdeling
```
Tipe transaksi 'material_request' {work_date, block_id?, activity_id?, lines:[{product_id, qty, uom}], note}
dari mandor_rawat; asisten approve di HP; Odoo posting ke stock.picking internal (gudang estate -> lokasi
afdeling) draft. Mandor konfirmasi terima (tipe 'material_receipt'). Validasi stok tersedia dari master
product (tambah qty_available per lokasi afdeling ke payload master). Tests.
```

### F-6 — Tiket panen NFC (paperless)
```
App: opsi tulis tiket panen ke tag NFC (NDEF, payload ringkas {u:mobile_uuid,n:ticket_no,j:janjang,b:block})
memakai lib/nfc.ts & nfc-parse.ts yang sudah ada; kerani transport bisa scan NFC selain QR di layar SPB.
Tag bisa ditimpa untuk hari berikutnya; tolak tag milik tiket yang sudah masuk SPB. Unit test encode/decode.
```

### F-7 — Ringkasan harian asisten/manajer di HP (read-only)
```
Endpoint baru GET /xsm/v1/summary?date=&afdeling_id= di Odoo (produksi kg vs rencana, HK, restan, skor mutu,
temuan terbuka, transaksi menunggu approval) + cache lokal di HP; layar /summary untuk asisten (dan role baru
'manajer' read-only) dengan kartu angka besar, offline menampilkan data terakhir + waktu sinkron. Tests kontrak.
```
