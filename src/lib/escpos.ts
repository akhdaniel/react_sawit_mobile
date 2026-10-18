/**
 * Encoder ESC/POS sederhana untuk printer thermal 58 mm (32 kolom font A).
 * Teks dikonversi ke ASCII (diakritik dihapus, karakter lain → '?') agar aman di semua printer.
 */
export const LINE_WIDTH = 32;

const ESC = 0x1b;
const GS = 0x1d;

export function toAscii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '?');
}

/** Pecah teks menjadi baris ≤ width, memotong di spasi bila bisa. */
export function wrap(text: string, width = LINE_WIDTH): string[] {
  const out: string[] = [];
  for (const para of toAscii(text).split('\n')) {
    let line = '';
    let emitted = false;
    for (const word of para.split(' ')) {
      if (word.length > width) {
        if (line) out.push(line);
        for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
        line = '';
        emitted = true;
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (next.length > width) {
        out.push(line);
        emitted = true;
        line = word;
      } else line = next;
    }
    if (line || !emitted) out.push(line);
  }
  return out;
}

/** Baris kiri-kanan dengan padding, mis. "Janjang ........ 23". */
export function twoColumns(left: string, right: string, width = LINE_WIDTH): string {
  const l = toAscii(left);
  const r = toAscii(right);
  if (l.length + r.length + 1 > width) return `${l.slice(0, Math.max(0, width - r.length - 1))} ${r}`;
  return l + ' '.repeat(width - l.length - r.length) + r;
}

export class EscPos {
  private bytes: number[] = [];

  private push(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  init(): this {
    return this.push(ESC, 0x40);
  }

  align(a: 'left' | 'center' | 'right'): this {
    return this.push(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  }

  bold(on: boolean): this {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  /** Ukuran ganda (lebar & tinggi) — 16 kolom per baris. */
  doubleSize(on: boolean): this {
    return this.push(GS, 0x21, on ? 0x11 : 0x00);
  }

  text(s: string): this {
    for (const ch of toAscii(s)) this.bytes.push(ch.charCodeAt(0));
    return this;
  }

  line(s = ''): this {
    return this.text(s).push(0x0a);
  }

  wrapped(s: string, width = LINE_WIDTH): this {
    for (const l of wrap(s, width)) this.line(l);
    return this;
  }

  row(left: string, right: string): this {
    return this.line(twoColumns(left, right));
  }

  divider(ch = '-'): this {
    return this.line(ch.repeat(LINE_WIDTH));
  }

  feed(n = 1): this {
    return this.push(ESC, 0x64, n);
  }

  /** QR model 2 via GS ( k: ukuran modul 1–16, koreksi error M. */
  qr(data: string, moduleSize = 6): this {
    const d = Array.from(toAscii(data), (c) => c.charCodeAt(0));
    const len = d.length + 3;
    return this.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00) // model 2
      .push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, Math.min(16, Math.max(1, moduleSize))) // ukuran
      .push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31) // koreksi M
      .push(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...d) // simpan data
      .push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // cetak
  }

  cut(): this {
    return this.push(GS, 0x56, 0x42, 0x00);
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Potong data menjadi paket sesuai MTU BLE. */
export function chunk(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}
