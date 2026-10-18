import { checkIntegrity, isCompromised, riskWarnings, type IntegrityReport } from '@/lib/guard';

const clean: IntegrityReport = { rooted: false, emulator: false, hooked: false, mockLocationEnabled: false };
const base = { integrity: clean, lastFixMocked: false, timeSource: 'server' as const, deviceSkewMs: 0, skewThresholdMs: 300_000 };

describe('guard', () => {
  it('checkIntegrity: emulator dari !isDevice; probe yang error dianggap false', () => {
    const r = checkIntegrity({
      isJailBroken: () => true,
      hookDetected: () => {
        throw new Error('x');
      },
      canMockLocation: () => false,
      isDevice: false,
    });
    expect(r).toEqual({ rooted: true, emulator: true, hooked: false, mockLocationEnabled: false });
    expect(isCompromised(r)).toBe(true);
    expect(isCompromised(clean)).toBe(false);
  });

  it('tanpa masalah → tanpa peringatan', () => {
    expect(riskWarnings(base)).toEqual([]);
  });

  it('root/emulator, fake GPS, jam tidak terkalibrasi', () => {
    expect(
      riskWarnings({ ...base, integrity: { ...clean, emulator: true }, lastFixMocked: true, timeSource: 'device' }),
    ).toEqual(['device_compromised', 'mocked_location', 'time_uncalibrated']);
  });

  it('aplikasi mock aktif hanya bila belum ada fix palsu; skew jam > batas', () => {
    expect(riskWarnings({ ...base, integrity: { ...clean, mockLocationEnabled: true }, deviceSkewMs: -400_000 })).toEqual([
      'mock_location_enabled',
      'time_skew',
    ]);
  });
});
