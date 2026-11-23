import { REFRESH_MIN_GAP_MS, refreshDecision, refreshOutcome } from '@/features/sync/refresh';
import type { SyncResult } from '@/sync/engine';

const result = (errors: SyncResult['errors'] = []) => ({ errors }) as SyncResult;

describe('tarik-untuk-refresh', () => {
  it('menjalankan sinkron, kecuali sedang berjalan atau baru saja', () => {
    expect(refreshDecision(50_000, null, false)).toBe('run');
    expect(refreshDecision(50_000, 45_000, true)).toBe('running');
    expect(refreshDecision(50_000, 50_000 - REFRESH_MIN_GAP_MS + 1, false)).toBe('too_soon');
    expect(refreshDecision(50_000, 50_000 - REFRESH_MIN_GAP_MS, false)).toBe('run');
  });

  it('meringkas hasil sinkron: auth didahulukan, lalu offline, lalu langkah yang gagal', () => {
    expect(refreshOutcome(result()).kind).toBe('ok');
    expect(refreshOutcome(result([{ step: 'push', kind: 'offline', message: 'x' }]))).toEqual({
      kind: 'offline',
      message: 'Tidak ada koneksi — data aman di HP',
    });
    expect(refreshOutcome(result([{ step: 'push', kind: 'offline', message: 'x' }, { step: 'push', kind: 'auth', message: 'y' }])).kind).toBe('auth');
    expect(refreshOutcome(result([{ step: 'verifications', kind: 'server', message: 'z' }]))).toEqual({
      kind: 'partial',
      message: 'Sebagian gagal: Mengambil antrean verifikasi tiket',
    });
  });
});
