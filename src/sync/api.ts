/**
 * Implementasi SyncApi di atas ApiClient (Bearer + refresh). Dipakai sync engine.
 */
import type { PhotoRow } from '../db/repositories/outbox';
import type { ApiClient } from './api-client';
import {
  heartbeatResponseSchema,
  masterResponseSchema,
  photoUploadResponseSchema,
  transactionsResponseSchema,
  transactionStatusResponseSchema,
  workplanResponseSchema,
} from './contract';
import type { SyncApi } from './engine';

/** Bagian file untuk FormData — RN memakai {uri,name,type}, Node memakai Blob. */
export type PhotoFilePart = (photo: PhotoRow) => Blob | { uri: string; name: string; type: string } | Promise<Blob>;

export const rnPhotoFilePart: PhotoFilePart = (p) => ({ uri: p.localUri, name: `${p.id}.jpg`, type: 'image/jpeg' });

export function createSyncApi(api: ApiClient, filePart: PhotoFilePart = rnPhotoFilePart): SyncApi {
  return {
    getMaster: (since) =>
      api.request('GET', since ? `/master?since=${encodeURIComponent(since)}` : '/master', { schema: masterResponseSchema }),
    getWorkplan: (date) => api.request('GET', `/workplan?date=${date}`, { schema: workplanResponseSchema }),
    postTransactions: (items) =>
      // Aman di-retry: server idempoten per mobile_uuid.
      api.request('POST', '/transactions', { body: { items }, schema: transactionsResponseSchema, timeoutMs: 60_000 }),
    getStatus: (ids) =>
      api.request('GET', `/transactions/status?ids=${ids.map(encodeURIComponent).join(',')}`, {
        schema: transactionStatusResponseSchema,
      }),
    async uploadPhoto(p) {
      const form = new FormData();
      form.append('file', (await filePart(p)) as Blob, `${p.id}.jpg`);
      form.append('mobile_uuid_photo', p.id);
      form.append('sha256', p.sha256);
      form.append('transaction_uuid', p.transactionUuid ?? '');
      return api.request('POST', '/photos', { formData: form, schema: photoUploadResponseSchema, timeoutMs: 60_000 });
    },
    async heartbeat(body) {
      await api.request('POST', '/device/heartbeat', { body, schema: heartbeatResponseSchema, retry: false });
    },
  };
}
