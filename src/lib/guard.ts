/**
 * Deteksi integritas perangkat (root, emulator, hook, lokasi palsu).
 * Prinsip: TIDAK memblokir — transaksi tetap disimpan dengan flag dan banner tampil.
 */
export interface IntegrityReport {
  rooted: boolean;
  emulator: boolean;
  /** Framework hooking (Frida/Xposed) terdeteksi. */
  hooked: boolean;
  /** Aplikasi lokasi palsu diizinkan di opsi pengembang. */
  mockLocationEnabled: boolean;
}

export interface IntegrityProbe {
  isJailBroken(): boolean;
  hookDetected(): boolean;
  canMockLocation(): boolean;
  isDevice: boolean;
}

function safe(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}

export function checkIntegrity(probe: IntegrityProbe): IntegrityReport {
  return {
    rooted: safe(() => probe.isJailBroken()),
    emulator: !probe.isDevice,
    hooked: safe(() => probe.hookDetected()),
    mockLocationEnabled: safe(() => probe.canMockLocation()),
  };
}

/** Nilai kolom `rooted` transaksi: perangkat tidak bisa dipercaya. */
export function isCompromised(r: IntegrityReport): boolean {
  return r.rooted || r.emulator || r.hooked;
}

export type RiskWarning = 'device_compromised' | 'mocked_location' | 'mock_location_enabled' | 'time_uncalibrated' | 'time_skew';

export interface RiskInput {
  integrity: IntegrityReport | null;
  lastFixMocked: boolean;
  timeSource: 'server' | 'device';
  deviceSkewMs: number;
  skewThresholdMs: number;
}

export function riskWarnings(i: RiskInput): RiskWarning[] {
  const out: RiskWarning[] = [];
  if (i.integrity && isCompromised(i.integrity)) out.push('device_compromised');
  if (i.lastFixMocked) out.push('mocked_location');
  else if (i.integrity?.mockLocationEnabled) out.push('mock_location_enabled');
  if (i.timeSource === 'device') out.push('time_uncalibrated');
  else if (Math.abs(i.deviceSkewMs) > i.skewThresholdMs) out.push('time_skew');
  return out;
}
