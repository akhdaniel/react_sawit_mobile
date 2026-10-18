import { useEffect, useState } from 'react';

import { riskWarnings, type RiskWarning } from '@/lib/guard';
import { useServices } from '@/lib/services';
import { SKEW_WARNING_MS, type TrustedTime } from '@/lib/trusted-time';

import { useSecurity } from './security-store';

/** Status trusted time, diperbarui saat kalibrasi dan tiap 30 detik. */
export function useTrustedTime(): TrustedTime {
  const { clock } = useServices();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const update = () => setNow(clock.now());
    const unsub = clock.subscribe(update);
    const timer = setInterval(update, 30_000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [clock]);
  return now;
}

export function useRiskWarnings(): { warnings: RiskWarning[]; skewMinutes: number } {
  const integrity = useSecurity((s) => s.integrity);
  const lastFixMocked = useSecurity((s) => s.lastFix?.mocked ?? false);
  const time = useTrustedTime();
  return {
    warnings: riskWarnings({
      integrity,
      lastFixMocked,
      timeSource: time.source,
      deviceSkewMs: time.deviceSkewMs,
      skewThresholdMs: SKEW_WARNING_MS,
    }),
    skewMinutes: Math.round(Math.abs(time.deviceSkewMs) / 60_000),
  };
}
