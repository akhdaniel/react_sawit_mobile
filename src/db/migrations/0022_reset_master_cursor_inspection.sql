-- Master baru untuk inspeksi (template, item checklist, temuan terbuka) dan kolom master baru (rincian pokok blok,
-- mandor pengganti): tarik snapshot master penuh sekali. Template yang dibuat ERP sebelum cursor HP tidak akan
-- pernah terkirim lewat delta.
DELETE FROM `sync_cursor`;
