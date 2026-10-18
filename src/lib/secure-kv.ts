/**
 * Penyimpanan kecil terenkripsi (token, PIN hash). Implementasi app memakai
 * expo-secure-store (Android Keystore); unit test memakai MemoryKV.
 */
export interface SecureKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryKV implements SecureKV {
  readonly data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
  }
  async remove(key: string) {
    this.data.delete(key);
  }
}
