import { createSyncApi } from '@/sync/api';
import type { ApiClient } from '@/sync/api-client';
import type { RequestOptions } from '@/sync/http';

const photo = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  transactionUuid: 'bbbbbbbb-0000-4000-8000-000000000002',
  localUri: 'file:///data/photos/aaaaaaaa.jpg',
  sha256: 'a'.repeat(64),
  sizeBytes: 1,
  takenTrustedAt: '2026-10-19T00:00:00Z',
  lat: null,
  lng: null,
  accuracyM: null,
  mocked: false,
  uploadStatus: 'pending' as const,
  serverPhotoId: null,
};

function capture() {
  const appended: unknown[][] = [];
  const RealFormData = global.FormData;
  global.FormData = class {
    append(...args: unknown[]) {
      appended.push(args);
    }
  } as unknown as typeof FormData;
  const api = {
    request: async (_m: string, _p: string, _o: RequestOptions<unknown>) => ({ photo_id: 7 }),
  } as unknown as ApiClient;
  return { api, appended, restore: () => (global.FormData = RealFormData) };
}

describe('createSyncApi.uploadPhoto', () => {
  it('objek File ber-bytes() (expo-file-system) dikirim apa adanya, bukan {uri,name,type}', async () => {
    const { api, appended, restore } = capture();
    const file = { name: `${photo.id}.jpg`, type: 'image/jpeg', bytes: async () => new Uint8Array([1, 2]) };
    try {
      await createSyncApi(api, () => file).uploadPhoto(photo);
      expect(appended[0]).toEqual(['file', file]);
      expect(appended[0]![1]).not.toHaveProperty('uri');
      expect(appended.slice(1).map((a) => a[0])).toEqual(['mobile_uuid_photo', 'sha256', 'transaction_uuid']);
    } finally {
      restore();
    }
  });

  it('Blob diberi nama file sesuai ekstensi (png untuk tanda tangan)', async () => {
    const { api, appended, restore } = capture();
    try {
      await createSyncApi(api, () => new Blob([new Uint8Array([1])], { type: 'image/png' })).uploadPhoto({ ...photo, localUri: 'file:///x/sig.png' });
      expect(appended[0]![2]).toBe(`${photo.id}.png`);
    } finally {
      restore();
    }
  });
});
