/**
 * Implementasi SyncApi di atas ApiClient (Bearer + refresh). Dipakai sync engine.
 */
import type { PhotoRow } from '../db/repositories/outbox';
import type { ApiClient } from './api-client';
import {
  approvalsResponseSchema,
  heartbeatResponseSchema,
  masterResponseSchema,
  photoUploadResponseSchema,
  transactionsResponseSchema,
  transactionStatusResponseSchema,
  workplanResponseSchema,
} from './contract';
import type { SyncApi } from './engine';

/**
 * Bagian file untuk FormData. fetch milik Expo (expo/winter, menggantikan fetch global di
 * SDK 58) HANYA menerima string, Blob, atau objek ber-`bytes()` (mis. File expo-file-system);
 * bentuk React Native `{uri, name, type}` ditolak dengan "Unsupported FormDataPart
 * implementation". Di app dipakai File expo-file-system, di Node/test dipakai Blob.
 */
export interface BytesFilePart {
  name: string;
  type: string;
  bytes(): Promise<Uint8Array>;
}
export type PhotoFilePart = (photo: PhotoRow) => Blob | BytesFilePart | Promise<Blob | BytesFilePart>;

export function photoFileName(p: PhotoRow): string {
  return p.localUri.endsWith('.png') ? `${p.id}.png` : `${p.id}.jpg`;
}

export function createSyncApi(api: ApiClient, filePart: PhotoFilePart): SyncApi {
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
      const part = await filePart(p);
      if (typeof Blob !== 'undefined' && part instanceof Blob) form.append('file', part, photoFileName(p));
      else form.append('file', part as unknown as Blob); // nama & tipe diambil dari objek File
      form.append('mobile_uuid_photo', p.id);
      form.append('sha256', p.sha256);
      form.append('transaction_uuid', p.transactionUuid ?? '');
      return api.request('POST', '/photos', { formData: form, schema: photoUploadResponseSchema, timeoutMs: 60_000 });
    },
    getApprovals: (afdelingId) => api.request('GET', `/approvals?afdeling_id=${afdelingId}`, { schema: approvalsResponseSchema }),
    async heartbeat(body) {
      await api.request('POST', '/device/heartbeat', { body, schema: heartbeatResponseSchema, retry: false });
    },
  };
}
