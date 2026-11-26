import { getDeviceIdentity } from '@/lib/device';
import { createTestDb } from '@/test/db';

const src = (androidId: string | null) => ({
  androidId: () => androidId,
  randomUUID: () => '11111111-2222-4333-8444-555555555555',
  modelName: 'Pixel 7',
  appVersion: '0.2.0',
});

describe('getDeviceIdentity', () => {
  it('memakai Android ID, stabil setelah disimpan', () => {
    const { db } = createTestDb();
    const a = getDeviceIdentity(db, src('abc123'));
    expect(a).toMatchObject({ deviceId: 'and-abc123', deviceModel: 'Pixel 7', appVersion: '0.2.0' });
    expect(a.deviceShort).toMatch(/^[A-Z0-9]{4}$/);
    // Android ID berubah (mis. reset pabrik sebagian) → tetap ID tersimpan
    expect(getDeviceIdentity(db, src('zzz')).deviceId).toBe('and-abc123');
  });

  it('fallback UUID bila Android ID tidak tersedia', () => {
    const { db } = createTestDb();
    expect(getDeviceIdentity(db, src(null)).deviceId).toBe('uuid-11111111-2222-4333-8444-555555555555');
  });
});

describe('device_short', () => {
  it('acak per instalasi: clear data memberi kode baru walau Android ID sama', () => {
    let n = 0;
    const fresh = () => ({ ...src('abc123'), randomUUID: () => `11111111-2222-4333-8444-${String(++n).padStart(12, '0')}` });
    const first = getDeviceIdentity(createTestDb().db, fresh());
    const afterClear = getDeviceIdentity(createTestDb().db, fresh());
    expect(afterClear.deviceId).toBe(first.deviceId);
    expect(afterClear.deviceShort).toMatch(/^[A-Z0-9]{4}$/);
    expect(afterClear.deviceShort).not.toBe(first.deviceShort);
  });

  it('tetap sama selama data aplikasi tidak dihapus', () => {
    const { db } = createTestDb();
    let n = 0;
    const fresh = () => ({ ...src('abc123'), randomUUID: () => `11111111-2222-4333-8444-${String(++n).padStart(12, '0')}` });
    expect(getDeviceIdentity(db, fresh()).deviceShort).toBe(getDeviceIdentity(db, fresh()).deviceShort);
  });
});
