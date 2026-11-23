-- Kolom master baru untuk tiket perawatan (dosis material per Ha, tarif perawatan):
-- tarik snapshot master penuh sekali agar tidak bergantung pada delta server.
DELETE FROM `sync_cursor`;
