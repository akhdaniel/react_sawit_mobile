import { create } from 'zustand';

import type { SyncResult, SyncStep } from '../../sync/engine';

interface SyncState {
  running: boolean;
  step: SyncStep | null;
  lastResult: SyncResult | null;
  setRunning(running: boolean): void;
  setStep(step: SyncStep | null): void;
  setResult(result: SyncResult | null): void;
}

export const useSync = create<SyncState>((set) => ({
  running: false,
  step: null,
  lastResult: null,
  setRunning: (running) => set({ running, step: null }),
  setStep: (step) => set({ step }),
  setResult: (lastResult) => set({ lastResult }),
}));

/** Token server habis pada sinkron terakhir → perlu login ulang. */
export function needsReauth(result: SyncResult | null): boolean {
  return !!result?.errors.some((e) => e.kind === 'auth');
}
