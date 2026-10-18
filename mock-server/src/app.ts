/**
 * Express app yang mengimplementasikan kontrak /xsm/v1. Request divalidasi dengan skema
 * zod yang sama dengan aplikasi (src/sync/contract).
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  approvalsRequestSchema,
  authRefreshRequestSchema,
  authTokenRequestSchema,
  heartbeatRequestSchema,
  isoDate,
  MASTER_ENTITY_NAMES,
  MAX_TX_BATCH,
  photoUploadFieldsSchema,
  txItemSchema,
  type MasterEntityName,
} from '../../src/sync/contract';
import { afdelingOf, evaluate, summarize } from './rules';
import type { Store } from './store';

export const API_PREFIX = '/xsm/v1';
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

type Authed = Request & { session: NonNullable<ReturnType<Store['authenticate']>> };

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const zodMessage = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'validation_error', zodMessage(r.error));
  return r.data;
}

export function createApp(store: Store) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES } });
  const api = express.Router();

  app.use(express.json({ limit: '10mb' }));

  // Semua respons JSON membawa server_time untuk kalibrasi trusted-time.
  app.use((_req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body: unknown) =>
      json(body && typeof body === 'object' && !Array.isArray(body)
        ? { ...body, server_time: new Date(store.opts.now()).toISOString() }
        : body);
    next();
  });

  // Gangguan buatan (latensi / error 503 acak) — hanya untuk endpoint API.
  api.use(async (_req, _res, next) => {
    if (store.faults.latencyMs > 0) await new Promise((r) => setTimeout(r, store.faults.latencyMs));
    if (store.faults.failRate > 0 && Math.random() < store.faults.failRate) {
      return next(new HttpError(503, 'unavailable', 'gangguan buatan mock server'));
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---- Auth --------------------------------------------------------------
  api.post('/auth/token', (req, res) => {
    const body = parse(authTokenRequestSchema, req.body);
    const issued = store.login(body.login, body.password, body.device_id);
    if (!issued) throw new HttpError(401, 'invalid_credentials', 'login atau password salah');
    res.json(issued);
  });

  api.post('/auth/refresh', (req, res) => {
    const body = parse(authRefreshRequestSchema, req.body);
    const issued = store.refreshToken(body.refresh_token);
    if (!issued) throw new HttpError(401, 'invalid_refresh_token', 'refresh token tidak valid');
    res.json(issued);
  });

  const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const session = store.authenticate(token);
    if (!session) return next(new HttpError(401, 'unauthorized', 'token tidak valid atau kedaluwarsa'));
    (req as Authed).session = session;
    next();
  };

  // ---- Master ------------------------------------------------------------
  api.get('/master', requireAuth, (req, res) => {
    const since = typeof req.query.since === 'string' && req.query.since !== '' ? req.query.since : undefined;
    try {
      res.json(store.masterSince(since));
    } catch (e) {
      throw new HttpError(400, 'invalid_cursor', (e as Error).message);
    }
  });

  api.get('/workplan', requireAuth, (req, res) => {
    const date = parse(isoDate, req.query.date);
    const { afdeling_ids } = (req as Authed).session.user;
    const items = store
      .listMaster<{ id: number; date: string; afdeling_id: number }>('work_plan')
      .filter((w) => w.date === date && afdeling_ids.includes(w.afdeling_id));
    res.json({ items });
  });

  // ---- Transaksi ---------------------------------------------------------
  api.post('/transactions', requireAuth, (req, res) => {
    const items: unknown = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'validation_error', 'items wajib berupa array');
    if (items.length > MAX_TX_BATCH) throw new HttpError(413, 'batch_too_large', `maksimal ${MAX_TX_BATCH} item per batch`);
    const userId = (req as Authed).session.user.id;

    // Diproses berurutan: absen di awal batch sudah berlaku untuk tiket panen di belakangnya.
    const results = items.map((raw) => {
      const uuidGuess = typeof raw?.mobile_uuid === 'string' ? raw.mobile_uuid : '';
      const prior = store.transactions.get(uuidGuess);
      if (prior) {
        // Idempoten: kirim ulang mengembalikan hasil asal.
        return prior.status === 'accepted'
          ? { mobile_uuid: uuidGuess, status: 'duplicate' as const, server_id: prior.serverId, reason: null }
          : { mobile_uuid: uuidGuess, status: 'rejected' as const, server_id: null, reason: prior.reason };
      }
      const parsed = txItemSchema.safeParse(raw);
      if (!parsed.success) {
        // Tidak disimpan: payload rusak bisa diperbaiki HP lalu dikirim lagi dengan uuid yang sama.
        return { mobile_uuid: uuidGuess, status: 'rejected' as const, server_id: null, reason: `invalid_payload: ${zodMessage(parsed.error)}` };
      }
      const item = parsed.data;
      const verdict = evaluate(store, item, userId);
      const serverId = verdict.ok ? store.allocServerId() : null;
      store.transactions.set(item.mobile_uuid, {
        item,
        status: verdict.ok ? 'accepted' : 'rejected',
        serverId,
        reason: verdict.reason ?? null,
        flags: verdict.flags,
        receivedAt: store.opts.now(),
        userId,
      });
      return verdict.ok
        ? { mobile_uuid: item.mobile_uuid, status: 'accepted' as const, server_id: serverId, reason: null }
        : { mobile_uuid: item.mobile_uuid, status: 'rejected' as const, server_id: null, reason: verdict.reason ?? null };
    });
    res.json({ results });
  });

  api.get('/transactions/status', requireAuth, (req, res) => {
    const ids = String(req.query.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) throw new HttpError(400, 'validation_error', 'ids wajib diisi');
    if (ids.length > MAX_TX_BATCH) throw new HttpError(413, 'batch_too_large', `maksimal ${MAX_TX_BATCH} id`);
    res.json({ results: ids.map((id) => store.serverStatus(id)) });
  });

  // ---- Foto --------------------------------------------------------------
  api.post('/photos', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) throw new HttpError(400, 'validation_error', 'file wajib diunggah');
    const fields = parse(photoUploadFieldsSchema, req.body);
    const saved = store.savePhoto(fields.mobile_uuid_photo, fields.transaction_uuid, fields.sha256, req.file.buffer);
    if ('error' in saved) throw new HttpError(422, saved.error, 'hash foto tidak cocok dengan isi file');
    res.json({ photo_id: saved.photoId });
  });

  // ---- Approval ----------------------------------------------------------
  api.get('/approvals', requireAuth, (req, res) => {
    const { user } = (req as Authed).session;
    if (!user.roles.includes('asisten')) throw new HttpError(403, 'forbidden', 'hanya asisten');
    const afdelingId = req.query.afdeling_id ? Number(req.query.afdeling_id) : undefined;
    const decided = new Set([...store.decisions.values()].map((d) => d.targetUuid));
    const items = [...store.transactions.values()]
      .filter((t) => t.status === 'accepted' && t.flags.length > 0 && !decided.has(t.item.mobile_uuid))
      .filter((t) => {
        const afd = afdelingOf(store, t.item);
        return afd != null && user.afdeling_ids.includes(afd) && (afdelingId == null || afd === afdelingId);
      })
      .map((t) => ({ target_uuid: t.item.mobile_uuid, target_type: t.item.type, summary: summarize(t.item), flags: t.flags }));
    res.json({ items });
  });

  api.post('/approvals', requireAuth, (req, res) => {
    const { user } = (req as Authed).session;
    if (!user.roles.includes('asisten')) throw new HttpError(403, 'forbidden', 'hanya asisten');
    const body = parse(approvalsRequestSchema, req.body);
    const results = body.items.map((d) => {
      if (store.decisions.has(d.mobile_uuid)) return { mobile_uuid: d.mobile_uuid, status: 'duplicate' as const, reason: null };
      if (!store.transactions.has(d.target_uuid)) return { mobile_uuid: d.mobile_uuid, status: 'rejected' as const, reason: 'target_not_found' };
      store.decisions.set(d.mobile_uuid, { targetUuid: d.target_uuid, decision: d.decision, userId: user.id });
      return { mobile_uuid: d.mobile_uuid, status: 'accepted' as const, reason: null };
    });
    res.json({ results });
  });

  // ---- Device ------------------------------------------------------------
  api.post('/device/heartbeat', requireAuth, (req, res) => {
    const body = parse(heartbeatRequestSchema, req.body);
    const { deviceId, user } = (req as Authed).session;
    store.heartbeats.set(deviceId, { ...body, user_id: user.id, at: new Date(store.opts.now()).toISOString() });
    res.json({ ok: true });
  });

  app.use(API_PREFIX, api);

  // ---- Endpoint pengembangan (bukan bagian kontrak) ------------------------
  const dev = express.Router();
  const entityParam = z.enum(MASTER_ENTITY_NAMES as [MasterEntityName, ...MasterEntityName[]]);
  dev.post('/reset', (_req, res) => {
    store.reset();
    res.json({ ok: true });
  });
  dev.post('/master/:entity/:id', (req, res) => {
    const entity = parse(entityParam, req.params.entity);
    const record = store.patchMaster(entity, Number(req.params.id), req.body ?? {});
    if (!record) throw new HttpError(404, 'not_found', 'record tidak ada');
    res.json({ record });
  });
  dev.delete('/master/:entity/:id', (req, res) => {
    const entity = parse(entityParam, req.params.entity);
    if (!store.deleteMaster(entity, Number(req.params.id))) throw new HttpError(404, 'not_found', 'record tidak ada');
    res.json({ ok: true });
  });
  dev.post('/faults', (req, res) => {
    const body = parse(
      z.object({ fail_rate: z.number().min(0).max(1).optional(), latency_ms: z.int().min(0).optional() }),
      req.body,
    );
    store.faults = { failRate: body.fail_rate ?? 0, latencyMs: body.latency_ms ?? 0 };
    res.json({ faults: store.faults });
  });
  dev.post('/expire-tokens', (_req, res) => {
    store.expireAllAccessTokens();
    res.json({ ok: true });
  });
  dev.get('/state', (_req, res) => {
    res.json({
      transactions: [...store.transactions.values()].map((t) => ({
        mobile_uuid: t.item.mobile_uuid,
        type: t.item.type,
        status: t.status,
        reason: t.reason,
        flags: t.flags,
      })),
      photos: [...store.photos.values()],
      decisions: [...store.decisions.entries()].map(([k, v]) => ({ mobile_uuid: k, ...v })),
      heartbeats: Object.fromEntries(store.heartbeats),
      users: store.users.map(({ password: _p, ...u }) => u),
    });
  });
  app.use('/_dev', dev);

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'endpoint tidak ditemukan')));

  // Format error kontrak: {error:{code,message}}.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    if (err instanceof multer.MulterError) return res.status(413).json({ error: { code: 'file_too_large', message: err.message } });
    if (err instanceof SyntaxError) return res.status(400).json({ error: { code: 'invalid_json', message: err.message } });
    console.error(err);
    return res.status(500).json({ error: { code: 'internal_error', message: 'kesalahan server' } });
  });

  return app;
}
