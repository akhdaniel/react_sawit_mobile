/**
 * Parsing kartu NFC pekerja (murni, diuji unit).
 * Kartu dikenali dari:
 *  1. Teks NDEF "XSM1|EMP|<employee_id>|<nik>" (ditulis di kantor), atau
 *  2. UID kartu yang terdaftar di master pekerja (employee.nfc_uid, milik server).
 */
export interface NdefRecordLike {
  tnf: number;
  type: number[] | string;
  payload: number[];
}

/** UID → heksadesimal huruf besar tanpa pemisah. */
export function normalizeUid(id: string | number[] | null | undefined): string | null {
  if (id == null) return null;
  const hex = Array.isArray(id) ? id.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join('') : id.replace(/[^0-9a-fA-F]/g, '');
  return hex.length ? hex.toUpperCase() : null;
}

function isTextType(type: number[] | string): boolean {
  if (Array.isArray(type)) return type.length === 1 && type[0] === 0x54;
  return type === 'T' || type.toUpperCase() === '54';
}

/** Dekode payload NDEF Text Record (RTD "T", UTF-8). null bila bukan text record. */
export function decodeTextRecord(rec: NdefRecordLike): string | null {
  if (rec.tnf !== 0x01 || !isTextType(rec.type) || rec.payload.length === 0) return null;
  const status = rec.payload[0]!;
  if (status & 0x80) return null; // UTF-16 tidak dipakai kartu Xerpium
  const langLen = status & 0x3f;
  const bytes = rec.payload.slice(1 + langLen);
  // UTF-8 → string (tanpa TextDecoder agar aman di semua runtime)
  return decodeURIComponent(bytes.map((b) => `%${(b & 0xff).toString(16).padStart(2, '0')}`).join(''));
}

export interface EmployeeCardRef {
  employeeId?: number;
  nik?: string;
}

const CARD_RE = /^XSM1\|EMP\|(\d+)\|([0-9A-Za-z-]*)$/;

export function employeeRefFromTexts(texts: string[]): EmployeeCardRef | null {
  for (const t of texts) {
    const m = CARD_RE.exec(t.trim());
    if (m) return { employeeId: Number(m[1]), nik: m[2] || undefined };
  }
  return null;
}
