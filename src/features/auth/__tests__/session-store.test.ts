import { useSession } from '@/features/auth/session-store';

const user = { id: 1, name: 'A', roles: ['asisten' as const], afdeling_ids: [1] };

describe('useSession auto-lock', () => {
  beforeEach(() => useSession.setState({ status: 'unlocked', user, backgroundedAt: null }));

  it('terkunci bila di latar belakang ≥ batas', () => {
    useSession.getState().markBackground(1_000);
    useSession.getState().markForeground(1_000 + 5 * 60_000, 5 * 60_000);
    expect(useSession.getState().status).toBe('locked');
  });

  it('tetap terbuka bila hanya sebentar', () => {
    useSession.getState().markBackground(1_000);
    useSession.getState().markForeground(1_000 + 60_000, 5 * 60_000);
    expect(useSession.getState().status).toBe('unlocked');
  });

  it('lock tidak mengubah status selain unlocked', () => {
    useSession.setState({ status: 'signedOut' });
    useSession.getState().lock();
    expect(useSession.getState().status).toBe('signedOut');
  });
});
