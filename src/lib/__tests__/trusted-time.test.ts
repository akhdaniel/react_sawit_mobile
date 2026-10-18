import {
  computeTrustedTime,
  makeAnchor,
  TrustedClock,
  workDateOf,
  type TimeAnchor,
} from '@/lib/trusted-time';
import { FakeClock } from '@/test/fake-clock';

const SERVER = '2026-10-18T02:00:00.000Z';

describe('trusted time', () => {
  it('tanpa anchor → jam HP, source device', () => {
    const c = new FakeClock();
    const t = computeTrustedTime(null, c);
    expect(t).toMatchObject({ source: 'device', reason: 'no_anchor', ms: c.wall });
  });

  it('waktu = server_time + selisih monotonic', () => {
    const c = new FakeClock();
    const a = makeAnchor(SERVER, c);
    c.advance(90 * 60_000);
    const t = computeTrustedTime(a, c);
    expect(t.source).toBe('server');
    expect(t.iso).toBe('2026-10-18T03:30:00.000Z');
    expect(t.anchorAgeMs).toBe(90 * 60_000);
  });

  it('kebal terhadap pengguna mengubah jam HP', () => {
    const c = new FakeClock();
    const a = makeAnchor(SERVER, c);
    c.advance(60_000);
    c.wall -= 3 * 86_400_000; // jam HP dimundurkan 3 hari
    const t = computeTrustedTime(a, c);
    expect(t.iso).toBe('2026-10-18T02:01:00.000Z');
    expect(t.deviceSkewMs).toBeLessThan(-2 * 86_400_000);
  });

  it('reboot (BOOT_COUNT berubah) → anchor batal, perkiraan dari jam HP dikoreksi skew', () => {
    const c = new FakeClock();
    // jam HP 1 jam lebih cepat dari server saat kalibrasi
    const a = makeAnchor(SERVER, c);
    expect(a.wallMs - a.serverMs).toBe(3_600_000);
    c.reboot(10 * 60_000);
    const t = computeTrustedTime(a, c);
    expect(t).toMatchObject({ source: 'device', reason: 'rebooted' });
    expect(t.iso).toBe('2026-10-18T02:10:00.000Z');
  });

  it('reboot tanpa BOOT_COUNT terdeteksi dari monotonic mundur', () => {
    const c = new FakeClock();
    c.boot = -1;
    const a = makeAnchor(SERVER, c);
    c.reboot();
    c.boot = -1;
    expect(computeTrustedTime(a, c).source).toBe('device');
  });

  it('server_time tidak valid ditolak', () => {
    expect(() => makeAnchor('kemarin', new FakeClock())).toThrow();
  });

  it('tanggal kerja memakai zona estate, bukan UTC', () => {
    const ms = Date.parse('2026-10-18T18:30:00Z'); // 01:30 WIB tgl 19
    expect(workDateOf(ms, 420)).toBe('2026-10-19');
    expect(workDateOf(ms, 0)).toBe('2026-10-18');
  });

  it('TrustedClock menyimpan anchor dan memberi tahu pendengar', () => {
    const c = new FakeClock();
    let stored: TimeAnchor | null = null;
    const clock = new TrustedClock(c, { load: () => stored, save: (a) => (stored = a) }, 420);
    const listener = jest.fn();
    clock.subscribe(listener);
    expect(clock.hasValidAnchor()).toBe(false);
    clock.calibrate(SERVER);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(stored).not.toBeNull();
    expect(clock.workDate()).toBe('2026-10-18');
    // instance baru memuat anchor tersimpan (restart app tanpa reboot)
    const again = new TrustedClock(c, { load: () => stored, save: () => {} }, 420);
    c.advance(1000);
    expect(again.now().iso).toBe('2026-10-18T02:00:01.000Z');
  });
});
