import crypto from 'node:crypto';
import { huoquSql } from './db.js';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function chuliEventPull(req, res) {
  if (process.env.EVENT_SYNC_ENABLED !== 'true') {
    return sendJson(res, 503, { error: { code: 'EVENT_SYNC_DISABLED', retryable: false } });
  }
  if (process.env.TOKEN_AUTH_ENABLED !== 'true') {
    return sendJson(res, 503, { error: { code: 'TOKEN_AUTH_DISABLED', retryable: false } });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: { code: 'REQUEST_INVALID', retryable: false } });
  }

  const match = String(req.headers?.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
  if (!match) return sendJson(res, 401, { error: { code: 'TOKEN_INVALID', retryable: false } });

  const rawAfter = req.query?.afterSequence ?? '0';
  const rawLimit = req.query?.limit ?? '100';
  if (!/^(0|[1-9]\d*)$/.test(String(rawAfter)) || !/^[1-9]\d*$/.test(String(rawLimit))) {
    return sendJson(res, 400, { error: { code: 'REQUEST_INVALID', retryable: false } });
  }
  const afterSequence = Number(rawAfter);
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isInteger(limit) || limit > 100) {
    return sendJson(res, 400, { error: { code: 'REQUEST_INVALID', retryable: false } });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(match[1]).digest('hex');
    const sql = huoquSql();
    const rows = await sql`
      SELECT eng_pull_events(
        ${tokenHash},
        ${afterSequence}::bigint,
        ${limit}::integer
      ) AS result
    `;
    const result = rows[0]?.result;
    if (!result || !Number.isInteger(Number(result.httpStatus))) {
      return sendJson(res, 503, { error: { code: 'SERVICE_UNAVAILABLE', retryable: true } });
    }
    const status = Number(result.httpStatus);
    if (status !== 200) {
      const code = String(result.errorCode || 'INTERNAL_ERROR');
      const retryable = ['TOKEN_EXPIRED', 'SERVICE_UNAVAILABLE', 'DB_TIMEOUT', 'INTERNAL_ERROR'].includes(code);
      return sendJson(res, status, { error: { code, retryable } });
    }
    return sendJson(res, 200, {
      events: Array.isArray(result.events) ? result.events : [],
      nextSequence: Number(result.nextSequence),
      hasMore: Boolean(result.hasMore),
      serverTime: Number(result.serverTime)
    });
  } catch (error) {
    console.error('[event-pull] request failed:', error?.message || 'unknown error');
    return sendJson(res, 503, { error: { code: 'SERVICE_UNAVAILABLE', retryable: true } });
  }
}
