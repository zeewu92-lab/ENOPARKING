function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('NATIVE_SYNC_BASE_URL_REQUIRED');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('NATIVE_SYNC_BASE_URL_INVALID'); }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '10.0.2.2';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error('NATIVE_SYNC_BASE_URL_MUST_USE_HTTPS');
  }
  return parsed.toString().replace(/\/$/, '');
}

function makeHttpError(response, body) {
  const code = body?.error?.code || 'NATIVE_SYNC_HTTP_ERROR';
  const error = new Error(String(code));
  error.code = String(code);
  error.status = response.status;
  error.retryable = Boolean(body?.error?.retryable);
  error.retryAfterMs = Number.isFinite(Number(body?.error?.retryAfterMs))
    ? Math.max(0, Number(body.error.retryAfterMs))
    : undefined;
  return error;
}

export function createNativeEventSyncTransport({ baseUrl, fetchImpl = globalThis.fetch } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (typeof fetchImpl !== 'function') throw new Error('NATIVE_SYNC_FETCH_UNAVAILABLE');

  async function request(path, accessToken, options = {}) {
    if (typeof accessToken !== 'string' || accessToken.length < 40) {
      throw new Error('NATIVE_SYNC_ACCESS_TOKEN_INVALID');
    }
    let response;
    try {
      response = await fetchImpl(base + path, {
        ...options,
        method: options.method || 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + accessToken,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });
    } catch (cause) {
      const error = new Error('NATIVE_SYNC_NETWORK_UNAVAILABLE');
      error.code = 'NATIVE_SYNC_NETWORK_UNAVAILABLE';
      error.cause = cause;
      error.retryable = true;
      throw error;
    }

    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw makeHttpError(response, body);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('NATIVE_SYNC_RESPONSE_INVALID');
    }
    return body;
  }

  return {
    pushEvents({ accessToken, deviceId, clientVersion, events }) {
      return request('/api/events/sync', accessToken, {
        method: 'POST',
        body: JSON.stringify({ deviceId, clientVersion, events }),
      });
    },
    pullEvents({ accessToken, afterSequence, limit = 100 }) {
      if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 ||
          !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error('NATIVE_SYNC_PULL_REQUEST_INVALID');
      }
      const query = '?afterSequence=' + encodeURIComponent(String(afterSequence)) +
        '&limit=' + encodeURIComponent(String(limit));
      return request('/api/events/pull' + query, accessToken);
    },
  };
}
