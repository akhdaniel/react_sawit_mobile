/**
 * Trusted time = waktu server saat kalibrasi terakhir + selisih jam monotonic perangkat.
 *
 * Jam HP (Date.now) bisa diubah pengguna, sedangkan elapsedRealtime tidak. Anchor disimpan
 * di DB lokal dan diperbarui setiap respons API yang membawa server_time.
 *
 * Setelah reboot, jam monotonic kembali ke 0 sehingga anchor tidak berlaku. Sampai kalibrasi
 * berikutnya, waktu diperkirakan dari jam HP dikoreksi selisih (skew) terakhir yang diketahui,
 * dan ditandai source = 'device'.
 */

export interface ClockSource {
  /** Milidetik monotonic sejak boot. */
  elapsedMs(): number;
  /** Nomor boot perangkat; -1 bila tidak diketahui. */
  bootCount(): number;
  /** Jam dinding HP (Date.now) — tidak dipercaya. */
  wallMs(): number;
}

export interface TimeAnchor {
  serverMs: number;
  elapsedMs: number;
  bootCount: number;
  /** Jam HP saat anchor dibuat — untuk menghitung skew. */
  wallMs: number;
}

export type TimeSource = 'server' | 'device';

export interface TrustedTime {
  ms: number;
  iso: string;
  source: TimeSource;
  /** Alasan source = 'device'. */
  reason: 'no_anchor' | 'rebooted' | null;
  /** Umur anchor (ms) bila masih berlaku. */
  anchorAgeMs: number | null;
  /** Jam HP − trusted time (ms). Positif = jam HP lebih cepat. */
  deviceSkewMs: number;
}

/** Selisih jam HP yang dianggap mencurigakan (jam HP sengaja diubah). */
export const SKEW_WARNING_MS = 5 * 60_000;
/** Anchor lebih tua dari ini → sarankan sinkron untuk kalibrasi ulang. */
export const STALE_ANCHOR_MS = 3 * 86_400_000;

export function makeAnchor(serverTimeIso: string, clock: ClockSource): TimeAnchor {
  const serverMs = Date.parse(serverTimeIso);
  if (Number.isNaN(serverMs)) throw new Error(`server_time tidak valid: ${serverTimeIso}`);
  return { serverMs, elapsedMs: clock.elapsedMs(), bootCount: clock.bootCount(), wallMs: clock.wallMs() };
}

export function isAnchorValid(anchor: TimeAnchor, clock: ClockSource): boolean {
  const boot = clock.bootCount();
  if (anchor.bootCount >= 0 && boot >= 0 && boot !== anchor.bootCount) return false;
  // Monotonic mundur = reboot (pada perangkat tanpa BOOT_COUNT).
  return clock.elapsedMs() >= anchor.elapsedMs;
}

export function computeTrustedTime(anchor: TimeAnchor | null, clock: ClockSource): TrustedTime {
  const wall = clock.wallMs();
  if (anchor && isAnchorValid(anchor, clock)) {
    const age = clock.elapsedMs() - anchor.elapsedMs;
    const ms = anchor.serverMs + age;
    return { ms, iso: new Date(ms).toISOString(), source: 'server', reason: null, anchorAgeMs: age, deviceSkewMs: wall - ms };
  }
  // Fallback: jam HP dikoreksi skew saat anchor terakhir (asumsi jam HP tidak diubah sejak itu).
  const lastSkew = anchor ? anchor.wallMs - anchor.serverMs : 0;
  const ms = wall - lastSkew;
  return {
    ms,
    iso: new Date(ms).toISOString(),
    source: 'device',
    reason: anchor ? 'rebooted' : 'no_anchor',
    anchorAgeMs: null,
    deviceSkewMs: lastSkew,
  };
}

/** Tanggal kerja YYYY-MM-DD pada zona estate (offset tetap, mis. WIB = +420 menit). */
export function workDateOf(ms: number, utcOffsetMinutes: number): string {
  return new Date(ms + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export interface AnchorStore {
  load(): TimeAnchor | null;
  save(anchor: TimeAnchor): void;
}

/**
 * Service trusted time untuk app: menyimpan anchor dan memberi tahu pendengar (UI)
 * saat kalibrasi berubah.
 */
export class TrustedClock {
  private anchor: TimeAnchor | null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly clock: ClockSource,
    private readonly store: AnchorStore,
    readonly utcOffsetMinutes: number,
  ) {
    this.anchor = store.load();
  }

  now(): TrustedTime {
    return computeTrustedTime(this.anchor, this.clock);
  }

  /** Tanggal kerja hari ini berdasarkan trusted time. */
  workDate(): string {
    return workDateOf(this.now().ms, this.utcOffsetMinutes);
  }

  /** Kalibrasi dari server_time respons API. */
  calibrate(serverTimeIso: string): void {
    const next = makeAnchor(serverTimeIso, this.clock);
    this.anchor = next;
    this.store.save(next);
    this.listeners.forEach((l) => l());
  }

  hasValidAnchor(): boolean {
    return this.anchor != null && isAnchorValid(this.anchor, this.clock);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
