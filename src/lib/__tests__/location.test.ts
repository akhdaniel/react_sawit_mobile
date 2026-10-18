import { getFix, type LocationApi, type RawLocation } from '@/lib/location';

const raw = (mocked?: boolean): RawLocation => ({
  coords: { latitude: 0.51, longitude: 101.41, accuracy: 6 },
  timestamp: 1000,
  mocked,
});

function api(over: Partial<LocationApi> = {}): LocationApi {
  return {
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: async () => raw(false),
    getLastKnownPositionAsync: async () => null,
    ...over,
  };
}

describe('getFix', () => {
  it('memetakan posisi dan flag mocked', async () => {
    expect(await getFix(api({ getCurrentPositionAsync: async () => raw(true) }))).toEqual({
      ok: true,
      fix: { lat: 0.51, lng: 101.41, accuracyM: 6, mocked: true, timestampMs: 1000, source: 'current' },
    });
  });

  it('mocked tidak ada → false', async () => {
    const r = await getFix(api({ getCurrentPositionAsync: async () => raw(undefined) }));
    expect(r.ok && r.fix.mocked).toBe(false);
  });

  it('izin ditolak / GPS mati', async () => {
    expect(await getFix(api({ requestForegroundPermissionsAsync: async () => ({ granted: false }) }))).toEqual({ ok: false, reason: 'permission_denied' });
    expect(await getFix(api({ hasServicesEnabledAsync: async () => false }))).toEqual({ ok: false, reason: 'services_disabled' });
  });

  it('GPS lambat → pakai posisi terakhir; tidak ada → unavailable', async () => {
    const slow = () => new Promise<RawLocation>(() => {});
    const last = await getFix(api({ getCurrentPositionAsync: slow, getLastKnownPositionAsync: async () => raw(false) }), { timeoutMs: 10 });
    expect(last.ok && last.fix.source).toBe('last_known');
    expect(await getFix(api({ getCurrentPositionAsync: slow }), { timeoutMs: 10 })).toEqual({ ok: false, reason: 'unavailable' });
  });
});
