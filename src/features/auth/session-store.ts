/**
 * State UI sesi (zustand). Logika ada di SessionService; store hanya memegang status
 * untuk guard rute expo-router.
 */
import { create } from 'zustand';

import type { AuthUser } from '../../sync/contract';
import type { SessionService } from './session-service';

export type SessionStatus = 'booting' | 'signedOut' | 'needsPin' | 'locked' | 'unlocked';

interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  /** Monotonic ms saat app masuk latar belakang. */
  backgroundedAt: number | null;
  init(service: SessionService): Promise<void>;
  signedIn(user: AuthUser, hasPin: boolean): void;
  pinSet(): void;
  unlocked(): void;
  lock(): void;
  signedOut(): void;
  markBackground(at: number): void;
  /** Kunci bila di latar belakang lebih lama dari batas. */
  markForeground(at: number, autoLockMs: number): void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'booting',
  user: null,
  backgroundedAt: null,
  async init(service) {
    const s = await service.restore();
    if (!s) set({ status: 'signedOut', user: null });
    else set({ status: s.hasPin ? 'locked' : 'needsPin', user: s.user });
  },
  signedIn: (user, hasPin) => set({ user, status: hasPin ? 'unlocked' : 'needsPin' }),
  pinSet: () => set({ status: 'unlocked' }),
  unlocked: () => set({ status: 'unlocked' }),
  lock: () => set((s) => (s.status === 'unlocked' ? { status: 'locked' } : s)),
  signedOut: () => set({ status: 'signedOut', user: null }),
  markBackground: (at) => set({ backgroundedAt: at }),
  markForeground(at, autoLockMs) {
    const { backgroundedAt } = get();
    set({ backgroundedAt: null });
    if (backgroundedAt != null && at - backgroundedAt >= autoLockMs) get().lock();
  },
}));
