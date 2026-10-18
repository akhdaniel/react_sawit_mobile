import type { ClockSource } from '@/lib/trusted-time';

/** Jam palsu: elapsed (monotonic), boot, dan wall bisa digerakkan terpisah. */
export class FakeClock implements ClockSource {
  elapsed = 1_000_000;
  boot = 7;
  wall = Date.parse('2026-10-18T03:00:00Z');
  elapsedMs = () => this.elapsed;
  bootCount = () => this.boot;
  wallMs = () => this.wall;
  /** Waktu berjalan normal: elapsed & wall maju bersamaan. */
  advance(ms: number) {
    this.elapsed += ms;
    this.wall += ms;
  }
  reboot(afterMs = 0) {
    this.boot += 1;
    this.elapsed = 30_000;
    this.wall += afterMs;
  }
}
