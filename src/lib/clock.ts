import XsmClock from '../../modules/xsm-clock';
import type { ClockSource } from './trusted-time';

/** Sumber jam perangkat: monotonic native + BOOT_COUNT + jam dinding. */
export const deviceClock: ClockSource = {
  elapsedMs: () => XsmClock.elapsedRealtime(),
  bootCount: () => XsmClock.bootCount(),
  wallMs: () => Date.now(),
};
