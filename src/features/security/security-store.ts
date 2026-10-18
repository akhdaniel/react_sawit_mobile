import { create } from 'zustand';

import type { IntegrityReport } from '../../lib/guard';
import type { GeoFix, LocationFailure } from '../../lib/location';

interface SecurityState {
  integrity: IntegrityReport | null;
  lastFix: GeoFix | null;
  locationFailure: LocationFailure | null;
  setIntegrity(r: IntegrityReport): void;
  setFix(fix: GeoFix): void;
  setLocationFailure(reason: LocationFailure): void;
}

export const useSecurity = create<SecurityState>((set) => ({
  integrity: null,
  lastFix: null,
  locationFailure: null,
  setIntegrity: (integrity) => set({ integrity }),
  setFix: (lastFix) => set({ lastFix, locationFailure: null }),
  setLocationFailure: (locationFailure) => set({ locationFailure }),
}));
