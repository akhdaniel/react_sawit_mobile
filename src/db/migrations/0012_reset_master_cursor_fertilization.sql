-- Kolom master baru untuk tiket pemupukan (pokok blok, jenis kemandoran, data pupuk, tarif pemupukan):
-- tarik snapshot master penuh sekali agar tidak bergantung pada delta server.
DELETE FROM `sync_cursor`;
