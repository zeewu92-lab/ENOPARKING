import crypto from 'node:crypto';
import { huoquSql } from './db.js';

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBearer(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
  return match ? match[1] : null;
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(item => stableStringify(item) ?? 'null').join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.filter(key => value[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + stableStringify(value[key]))
    .join(',') + '}';
}

export function fingerprint(event) {
  const canonical = stableStringify({
    type: event?.type,
    localCounter: event?.localCounter,
    payload: event?.payload,
    createdAt: event?.createdAt
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 4 * 1024 * 1024) reject(new Error('REQUEST_TOO_LARGE'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('REQUEST_INVALID'));
      }
    });
    req.on('error', reject);
  });
}

export async function chuliEventSync(req, res) {
  if (process.env.EVENT_SYNC_ENABLED !== 'true') {
    return sendJson(res, 503, { error: { code: 'EVENT_SYNC_DISABLED', retryable: false } });
  }
  if (process.env.TOKEN_AUTH_ENABLED !== 'true') {
    return sendJson(res, 503, { error: { code: 'TOKEN_AUTH_DISABLED', retryable: false } });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: { code: 'REQUEST_INVALID', retryable: false } });
  }

  try {
    const token = readBearer(req);
    if (!token) return sendJson(res, 401, { error: { code: 'TOKEN_INVALID', retryable: false } });
    const body = await readBody(req);
    if (!UUID_V4.test(String(body.deviceId || '')) ||
        !SEMVER.test(String(body.clientVersion || '')) ||
        !Array.isArray(body.events) ||
        body.events.length > 100) {
      return sendJson(res, 400, { error: { code: 'REQUEST_INVALID', retryable: false } });
    }

    const events = body.events.map(event => ({
      ...(event && typeof event === 'object' && !Array.isArray(event) ? event : {}),
      _fingerprint: fingerprint(event)
    }));
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sql = huoquSql();
    const rows = await sql`
      SELECT eng_sync_events(
        ${tokenHash},
        ${body.deviceId}::uuid,
        ${body.clientVersion},
        ${JSON.stringify(events)}::jsonb
      ) AS result
    `;
    const result = rows[0]?.result;
    if (!result || !Number.isInteger(Number(result.httpStatus))) {
      return sendJson(res, 503, { error: { code: 'SERVICE_UNAVAILABLE', retryable: true } });
    }
    const status = Number(result.httpStatus);
    if (status !== 200) {
      const code = String(result.errorCode || 'INTERNAL_ERROR');
      const retryable = ['TOKEN_EXPIRED', 'SERVICE_UNAVAILABLE', 'DB_TIMEOUT', 'INTERNAL_ERROR', 'RATE_LIMITED'].includes(code);
      const retryAfterMs = Number.isFinite(Number(result.retryAfterMs)) ? Math.max(0, Number(result.retryAfterMs)) : undefined;
      if (status === 429 && retryAfterMs !== undefined) {
        res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      }
      return sendJson(res, status, {
        error: { code, retryable, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) }
      });
    }
    if (result.sequenceNearLimit) {
      console.warn('[event-sync] account sequence is nearing the JavaScript safe-integer ceiling');
    }
    return sendJson(res, 200, {
      results: Array.isArray(result.results) ? result.results : [],
      sequenceNearLimit: Boolean(result.sequenceNearLimit),
      serverTime: Number(result.serverTime)
    });
  } catch (error) {
    console.error('[event-sync] request failed:', error?.message || 'unknown error');
    if (error?.message === 'REQUEST_INVALID' || error?.message === 'REQUEST_TOO_LARGE') {
      return sendJson(res, 400, { error: { code: 'REQUEST_INVALID', retryable: false } });
    }
    return sendJson(res, 503, { error: { code: 'SERVICE_UNAVAILABLE', retryable: true } });
  }
}
