/**
 * Pipeline foto bukti: hanya dari kamera dalam aplikasi (tidak ada akses galeri).
 * Kompres ke sisi terpanjang ≤ 1280 px, JPEG kualitas 0.6, turunkan bertahap sampai
 * ≤ 300 KB; simpan di folder privat aplikasi; hitung SHA-256 dari file final.
 */
export interface PhotoPolicy {
  maxEdge: number;
  quality: number;
  targetBytes: number;
  minQuality: number;
  qualityStep: number;
  /** Bila kualitas minimum masih > target, perkecil sisi terpanjang ke nilai ini. */
  fallbackEdge: number;
}

export const DEFAULT_PHOTO_POLICY: PhotoPolicy = {
  maxEdge: 1280,
  quality: 0.6,
  targetBytes: 300_000,
  minQuality: 0.3,
  qualityStep: 0.1,
  fallbackEdge: 960,
};

export interface EncodedImage {
  uri: string;
  sizeBytes: number;
}

export interface PhotoIO {
  /** Encode ulang `sourceUri` sebagai JPEG dengan sisi terpanjang ≤ maxEdge. */
  encode(sourceUri: string, maxEdge: number, quality: number): Promise<EncodedImage>;
  /** Pindahkan file ke penyimpanan privat permanen dengan nama `${id}.jpg`. */
  persist(uri: string, id: string): Promise<string>;
  sha256(uri: string): Promise<string>;
  remove(uri: string): void;
}

export interface ProcessedPhoto {
  localUri: string;
  sizeBytes: number;
  sha256: string;
  quality: number;
  maxEdge: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function processPhoto(
  rawUri: string,
  id: string,
  io: PhotoIO,
  policy: PhotoPolicy = DEFAULT_PHOTO_POLICY,
): Promise<ProcessedPhoto> {
  const attempts: { edge: number; quality: number }[] = [];
  for (let q = policy.quality; q >= policy.minQuality - 1e-9; q = round1(q - policy.qualityStep)) {
    attempts.push({ edge: policy.maxEdge, quality: round1(q) });
  }
  attempts.push({ edge: policy.fallbackEdge, quality: policy.minQuality });

  let best: (EncodedImage & { edge: number; quality: number }) | null = null;
  try {
    for (const a of attempts) {
      const out = await io.encode(rawUri, a.edge, a.quality);
      if (best) io.remove(best.uri);
      best = { ...out, ...a };
      if (out.sizeBytes <= policy.targetBytes) break;
    }
  } finally {
    io.remove(rawUri);
  }
  if (!best) throw new Error('Foto gagal diproses');
  const localUri = await io.persist(best.uri, id);
  return { localUri, sizeBytes: best.sizeBytes, sha256: await io.sha256(localUri), quality: best.quality, maxEdge: best.edge };
}
