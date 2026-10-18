import { processPhoto, type PhotoIO } from '@/lib/photo';

function fakeIO(sizes: (edge: number, q: number) => number) {
  const calls: { edge: number; quality: number }[] = [];
  const removed: string[] = [];
  const io: PhotoIO = {
    async encode(_src, edge, quality) {
      calls.push({ edge, quality });
      return { uri: `tmp-${edge}-${quality}.jpg`, sizeBytes: sizes(edge, quality) };
    },
    async persist(uri, id) {
      return `file:///doc/photos/${id}.jpg?from=${uri}`;
    },
    async sha256() {
      return 'ab'.repeat(32);
    },
    remove: (u) => removed.push(u),
  };
  return { io, calls, removed };
}

describe('processPhoto', () => {
  it('langsung jadi bila ≤ 300 KB pada kualitas 0.6 / 1280 px', async () => {
    const { io, calls, removed } = fakeIO(() => 250_000);
    const r = await processPhoto('raw.jpg', 'p1', io);
    expect(calls).toEqual([{ edge: 1280, quality: 0.6 }]);
    expect(r).toMatchObject({ sizeBytes: 250_000, quality: 0.6, maxEdge: 1280, sha256: 'ab'.repeat(32) });
    expect(r.localUri).toContain('/photos/p1.jpg');
    expect(removed).toContain('raw.jpg');
  });

  it('turunkan kualitas bertahap sampai target', async () => {
    const { io, calls, removed } = fakeIO((_e, q) => (q > 0.4 ? 420_000 : 280_000));
    const r = await processPhoto('raw.jpg', 'p2', io);
    expect(calls.map((c) => c.quality)).toEqual([0.6, 0.5, 0.4]);
    expect(r.quality).toBe(0.4);
    expect(removed).toEqual(expect.arrayContaining(['tmp-1280-0.6.jpg', 'tmp-1280-0.5.jpg', 'raw.jpg']));
  });

  it('terakhir perkecil resolusi; tetap simpan hasil terbaik bila masih di atas target', async () => {
    const { io, calls } = fakeIO((edge) => (edge === 960 ? 320_000 : 900_000));
    const r = await processPhoto('raw.jpg', 'p3', io);
    expect(calls.at(-1)).toEqual({ edge: 960, quality: 0.3 });
    expect(r).toMatchObject({ maxEdge: 960, sizeBytes: 320_000 });
  });

  it('file mentah dihapus walau encode gagal', async () => {
    const removed: string[] = [];
    const io: PhotoIO = {
      encode: async () => {
        throw new Error('decode error');
      },
      persist: async (u) => u,
      sha256: async () => '',
      remove: (u) => removed.push(u),
    };
    await expect(processPhoto('raw.jpg', 'p4', io)).rejects.toThrow('decode error');
    expect(removed).toEqual(['raw.jpg']);
  });
});
