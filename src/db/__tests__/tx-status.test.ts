import { canTransition, isMutable, TX_STATUSES } from '@/db/tx-status';

describe('tx-status', () => {
  it('mengikuti alur draft → queued → sent → accepted|rejected → posted', () => {
    expect(canTransition('draft', 'queued')).toBe(true);
    expect(canTransition('queued', 'sent')).toBe(true);
    expect(canTransition('sent', 'accepted')).toBe(true);
    expect(canTransition('sent', 'rejected')).toBe(true);
    expect(canTransition('accepted', 'posted')).toBe(true);
  });

  it('status akhir tidak bisa berpindah', () => {
    for (const to of TX_STATUSES) {
      if (to !== 'rejected') expect(canTransition('rejected', to)).toBe(false);
      if (to !== 'posted') expect(canTransition('posted', to)).toBe(false);
    }
  });

  it('tidak bisa kembali ke draft setelah terkirim', () => {
    expect(canTransition('sent', 'draft')).toBe(false);
    expect(canTransition('accepted', 'queued')).toBe(false);
  });

  it('hanya draft dan queued yang boleh diubah', () => {
    expect(TX_STATUSES.filter(isMutable)).toEqual(['draft', 'queued']);
  });
});
