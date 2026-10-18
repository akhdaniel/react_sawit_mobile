/** Base64 untuk Uint8Array tanpa dependensi (BLE ble-plx menerima data base64). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63]!;
    out += c === undefined ? '=' : ALPHABET[n & 63]!;
  }
  return out;
}
