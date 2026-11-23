# Dev handoff — Xerpium Sawit Mobile + Odoo bridge

Status as of 2026-11-23. Written to hand the work to another Claude Code session.
Read the commit messages for detail: they are written to be self-explanatory.

## Repos

| What | Path | Branch | Head |
|---|---|---|---|
| Mobile app (Expo SDK 58, RN 0.88, Android) | `/Volumes/Extreme Data/react_sawit_mobile` | `main` = `origin/main` | `e0d4a3b` (merge PR #1 from `budi`) |
| Odoo 18 addons | `/Users/daniel/data/odoo-docker-new/18.0/addons/sawit` | `gab` = `origin/gab` | `ee7c2d4` (merge PR #1 from `budi`) |

Remotes: `github.com/akhdaniel/react_sawit_mobile`, `github.com/xerpium/sawit`.
Contributors: Daniel (owner), budi-irawan (plantation/mill/mobile, via branch `budi`), Jaya Dianto (weighscale, UI).

App version **0.9.9** (versionCode 18) — not bumped since the merges, so the next APK needs a bump.
Bridge module `xerpium_sawit_mobile` **18.0.1.9.0**. The README lists the minimum module version each app feature
needs (≥ 1.3.0 ERP structure, ≥ 1.4.0 fertilization, ≥ 1.5.0 maintenance tickets).

## The big shift since early November

The ERP is no longer "realisasi panen" per block. `xerpium_plantation` now has **core ticket documents** and the
mobile bridge posts **directly into them** at sync time (no asisten queue for tickets/SPB):

| Phone transaction | Core Odoo document (draft, source Mobile) |
|---|---|
| `harvest_ticket` | `xerpium.harvest.ticket` (one harvester, one TPH, one date; premi/denda from active tariff) |
| `spb` | `xerpium.spb` with ticket loads, then dispatched; mill receipt picks the SPB, net weight allocated to tickets |
| `fertilization_ticket` | `xerpium.fertilization.ticket` (one worker; dose limits, fertilizer stock, wage) |
| `maintenance_ticket` | `xerpium.maintenance.ticket` with material lines (material rules depend on work type) |
| `stage_confirm` ("Lanjutkan") | moves the core ticket one stage as the sender (dynamic stages) |
| `attendance` | `hr.attendance` (open attendance auto-closed after `xerpium_sawit_mobile.shift_hours`, default 7) |
| `upkeep` + `material_usage` (old app screens) | `xerpium.maintenance.activity` — legacy, kept so unsent old data still posts |

The cron (15 min) is now only a retry for things that could not post yet (SPB waiting for tickets, failed posts).
Other flagged transactions still wait for asisten approval.

### Modules involved

- `xerpium_plantation` — masters (kelas medan, sub blok, TPH under block, kemandoran with member history and
  substitute mandor, harvest tariff header/lines, TBS transport tariff), harvest ticket, SPB, fertilization ticket
  (replaces plan/realisation of fertilizing), maintenance ticket (per worker, material, wage to payroll),
  material transfers, helper workers and double-work detection. Groups: Mandor, Kerani Panen, Kerani Rawat,
  Kerani Transport, Asisten.
- `xerpium_hr_plantation` — monthly harvester wage recap from verified tickets → payslip (`PREMI_PANEN`),
  fertilization/maintenance wage recap, structure KEBUN, transport cost (`ONGKOS_ANGKUT`) to payslip and to
  vendor bills for rented vehicles.
- `xerpium_sawit_dynamic_stage` — configurable stages for harvest ticket, SPB, fertilization, maintenance ticket,
  TBS receipt, process batch, CPO dispatch. Verification order: mandor then kerani (two required stages must be
  done by different people).
- `xerpium_mill` — SPB rules on TBS receipt, process batch by phase (no MO, WIP stock), tank stock, CPO dispatch
  with Sales Order, rendemen validation. `xerpium_weighscale_integration` (Jaya) — weighbridge.
- `xerpium_sawit_mobile` — the bridge (below).

## Bridge `xerpium_sawit_mobile`

Depends: xerpium_sawit, xerpium_plantation, xerpium_sawit_dynamic_stage, xerpium_hr_plantation, xerpium_mill,
fleet, hr_attendance.

- `models/master.py` — master delta (cursor `(write_date, entity_idx, id)`, tombstones). TPH and kemandoran now
  come from the core models; `xerpium.blok.xsm_tph_ids` (renamed from `tph_ids`), `bjr_kg` moved to core.
- `models/auth.py` — devices, sha256-hashed access + rotating refresh tokens, `xsm_afdeling_ids`.
  Mobile role groups: mandor_panen, kerani_panen, mandor_rawat, **kerani_rawat** (new), kerani_transport, asisten.
- `models/transactions.py` — `xsm.tx.inbox` (idempotency per `mobile_uuid`, flags, approval) + append-only typed
  records incl. fertilization/maintenance tickets and `stage_confirm` (targets: harvest, fertilization,
  maintenance ticket via `core_*_ticket_id`).
- `models/sync_service.py` — shape validation, rules `_rule_<type>`, `process_transactions`, `DIRECT_POST_TYPES`,
  posting in the sender's timezone (default Asia/Jakarta; fixes 00:00–07:00 WIB "future date" rejects).
- `models/posting.py` — posting to core documents (table above), pending stage_confirm retried when the ticket
  reaches the sender's stage (also when advanced in Odoo), photos copied to the core ticket.
- `models/backend_entry.py` — admin entry of field transactions in Odoo through the same validation path
  (older feature; the mobile ticket/SPB menus are now hidden, see menus below).
- `controllers/api.py` — `/xsm/v1`: `auth/token`, `auth/refresh`, `master`, `workplan`, `transactions`,
  `transactions/status` (now carries `post_error` and the ERP document/stage), `photos`, `approvals`,
  **`verifications`** (queue of core tickets whose next stage belongs to the user: harvest `items`,
  `fertilization_items`, `maintenance_items`), `device/heartbeat`. Routes need `readonly=False`.
- Rejection codes added: `ticket_already_transported` (correcting a ticket already on an SPB),
  `ticket_already_verified` (correcting verified fertilization/maintenance tickets — cancelling is the asisten's
  right), `material_not_allowed` (maintenance work types without material).
- UI: "Data Mobile" button on core harvest ticket, SPB, fertilization and maintenance tickets; Mobile menu
  trimmed (technical data for managers only, legacy data under "Data Lama" in debug mode).
- Tests: 80 in the module (`test_sync`, `test_posting`, `test_api`, `test_backend_entry`, `test_stage_confirm`,
  `test_fertilization*`, `test_maintenance*`).

## Mobile app

Offline-first (encrypted SQLite + drizzle, migrations up to **0019**). Every record is an append-only transaction;
corrections are new transactions with `correction_of`. Sync: push → photos → status → master → workplan →
approvals/verifications → heartbeat. Contract = zod schemas in `src/sync/contract/{master,transactions,api}.ts`;
`mock-server/` follows the same contract (incl. kerani.rawat user and verification queues).

Screens (`src/app/(app)/`): attendance, assignment, harvest, transport (SPB), **fertilization**, **maintenance**
(replaced the old upkeep screens), **verification**, approval, daily-report, sync, account, printer.

Since early November:
- Harvest premi breakdown from ERP harvest tariff (kelas medan of sub blok); ticket QR carries brondolan
  (all phones must update together; old QR still readable).
- ERP document status on transaction detail (number, status, stage, net weight, `post_error`).
- **Lanjutkan** / **Simpan & Lanjutkan** on tickets → `stage_confirm`; tickets are pushed before the
  stage_confirm in the same batch. Correction button hidden once a ticket is verified or loaded on an SPB.
- **Verifikasi tiket** menu: queue from `GET /verifications`, pulled every sync, usable offline
  (tables `fertilization_verification_queue` 0018, `maintenance_verification_queue` 0019).
- Role kerani_rawat: Absensi, Pemupukan, Perawatan, Verifikasi. Mandor rawat also gets Verifikasi.
- Maintenance material follows work type (required for weed spraying, pest and rat control; none for manual work).
- Pull-to-refresh = full sync (min 10 s apart) on home, lists and details; not on entry forms.
- Server rejection reasons translated (Sync screen, Lanjutkan status).
- Earlier (still valid): server switch resets master; keyboard-safe forms; read-only entry views from list rows.

## Running Odoo

The user's real DBs are `sawit`, `sawit2`, `sawit3` — **untouched; ask before installing or running there.**
The test DB used for the phone was `sawit_mobile_test` (port 18069). It predates the core-ticket work, so expect
to upgrade it (or create a fresh one) and re-seed users/masters. Seed users: mandor.panen, kerani.panen,
mandor.rawat, kerani.rawat, kerani.transport, asisten — password = `TEST_PASSWORD` in `mock-server/src/seed.ts`
(never paste it in chat). Sample data in `xerpium_sawit` is no longer re-applied on module upgrade (6d740cd).

```bash
cd /Users/daniel/data/odoo-docker-new/18.0 && source 18.0/bin/activate
odoo -c config/odoo.conf -d <db> --db-filter='^<db>$' --http-port=18069 --max-cron-threads=1
odoo -c config/odoo.conf -d <db> -u xerpium_sawit_mobile --test-tags /xerpium_sawit_mobile --stop-after-init --no-http --http-port=18070
```

Python changes need a server restart. Phone → Odoo over USB: `adb reverse tcp:18069 tcp:18069` then
`http://localhost:18069/xsm/v1`; over Wi-Fi: `http://<Mac LAN IP>:18069/xsm/v1`.
Mock server instead: `npm run mock-server` (port 8080).

## Building the APK

```bash
cd android
export JAVA_HOME=/Users/daniel/Library/Java/JavaVirtualMachines/jbr-17.0.14/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a   # arm64 only, otherwise very slow
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
```

Bump `app.json` (`version`, `versionCode`) and `android/app/build.gradle` (`versionName`, `versionCode`) together.
Copy APKs to `~/Dropbox/APK/sawit/xerpium-sawit-<ver>-arm64-v8a-release.apk`. Test phone: Samsung over USB (`adb devices`).
Before done: `npx tsc --noEmit`, `npx expo lint` (or `npx eslint`), `npx jest`.

## Known issues / open items

1. App version not bumped after the merges (still 0.9.9); the APK on the phone may be older than `main`.
2. Re-login after switching servers fails when the user id differs ("Akun berbeda…"); workaround
   `adb shell pm clear com.xerpium.sawit`. Proper fix: block server change while data is pending and clear the
   session on server change.
3. Pre-existing test failures seen in early November (4 tests in `xerpium_plantation` grading and
   `xerpium_hr_plantation` premium compute) — re-check; those modules changed a lot since.
4. Installing the bridge into the real DBs — ask the user first.
5. Next feature ideas: see `docs/PROMPT_INSPEKSI_DAN_FITUR_LANJUTAN.md` (inspection module and further features,
   written 22 Nov; untracked).

## Working rules from the user

- Prefix shell commands with `rtk` (token-saving wrapper; passes through unknown commands).
- Commit/push only when asked; no force-push; ask before deleting APKs in Dropbox.
- Never enter the user's PIN or real passwords; ask which Odoo DB before running Odoo.
- The user writes in Indonesian; app commit subjects are Indonesian, addon commits use `feat(module): …`.
- Follow `AGENTS.md` in the app repo (Expo docs per SDK version, `npx expo install`, CNG rules).
