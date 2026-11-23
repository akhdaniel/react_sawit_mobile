-- Master baru (sub blok, tarif panen, PKS) dan kolom baru (peran/tipe karyawan, kepemilikan kendaraan):
-- tarik snapshot master penuh sekali agar tidak bergantung pada delta server.
DELETE FROM `sync_cursor`;
