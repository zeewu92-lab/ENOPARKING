import { requestWithEventSyncAuth } from './eventSyncAuth.js';

async function parseResponse(response) {
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const code = body?.error?.code || 'EVENT_SYNC_SERVICE_ERROR';
    const error = new Error(String(code));
    error.code = String(code);
    error.status = response.status;
    error.retryable = Boolean(body?.error?.retryable);
    error.retryAfterMs = Number.isFinite(Number(body?.error?.retryAfterMs))
      ? Number(body.error.retryAfterMs)
      : undefined;
    throw error;
  }
  return body;
}

export async function pushEvents({ deviceId, clientVersion, events }) {
  const response = await requestWithEventSyncAuth('/api/events/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, clientVersion, events })
  });
  return parseResponse(response);
}

export async function pullEvents({ afterSequence = 0, limit = 100 } = {}) {
  const params = new URLSearchParams({
    afterSequence: String(afterSequence),
    limit: String(limit)
  });
  const response = await requestWithEventSyncAuth('/api/events/pull?' + params.toString(), {
    method: 'GET'
  });
  return parseResponse(response);
}
