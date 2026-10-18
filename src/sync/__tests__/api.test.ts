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
  it('React Native: bagian file {uri,name,type} dikirim TANPA argumen nama file', async () => {
    const { api, appended, restore } = capture();
    try {
      await createSyncApi(api).uploadPhoto(photo);
      expect(appended[0]).toEqual(['file', { uri: photo.localUri, name: `${photo.id}.jpg`, type: 'image/jpeg' }]);
      expect(appended.slice(1).map((a) => a[0])).toEqual(['mobile_uuid_photo', 'sha256', 'transaction_uuid']);
    } finally {
      restore();
    }
  });

  it('PNG tanda tangan memakai image/png', async () => {
    const { api, appended, restore } = capture();
    try {
      await createSyncApi(api).uploadPhoto({ ...photo, localUri: 'file:///x/sig.png' });
      expect(appended[0]![1]).toMatchObject({ type: 'image/png', name: `${photo.id}.png` });
    } finally {
      restore();
    }
  });
});
