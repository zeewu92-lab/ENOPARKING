const ENABLED = import.meta.env.VITE_EVENT_SYNC_ENABLED === 'true';
const REFRESH_REQUEST_ID_KEY = 'enoparking:refresh-request-id:v1';
const ACCESS_TOKEN_SKEW_MS = 20_000;

let accessToken = null;
let accessTokenExpiresAt = 0;
let bootstrapPromise = null;
let refreshPromise = null;

function tokenIsUsable() {
  return Boolean(accessToken) && accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS;
}

function errorFromResponse(response, body) {
  const code = body?.error?.code || body?.error || 'TOKEN_SERVICE_ERROR';
  const error = new Error(String(code));
  error.code = String(code);
  error.status = response.status;
  error.retryable = Boolean(body?.error?.retryable);
  error.retryAfterMs = Number.isFinite(Number(body?.error?.retryAfterMs))
    ? Number(body.error.retryAfterMs)
    : undefined;
  return error;
}

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

function uuidV4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function saveAccessToken(response, body) {
  const header = response.headers.get('Authorization') || '';
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
  const expiresIn = Number(body?.expiresIn);
  if (!match || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('TOKEN_RESPONSE_INVALID');
  }
  accessToken = match[1];
  accessTokenExpiresAt = Date.now() + expiresIn * 1000;
  return accessToken;
}

async function exchangeSessionCookie() {
  const response = await fetch('/api/token/exchange', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store'
  });
  const body = await readJson(response);
  if (!response.ok) throw errorFromResponse(response, body);
  return saveAccessToken(response, body);
}

async function performRefresh() {
  let requestId;
  try {
    requestId = localStorage.getItem(REFRESH_REQUEST_ID_KEY);
    if (!requestId) {
      requestId = uuidV4();
      localStorage.setItem(REFRESH_REQUEST_ID_KEY, requestId);
    }
  } catch {
    throw new Error('REFRESH_REQUEST_ID_STORAGE_UNAVAILABLE');
  }

  let response;
  try {
    response = await fetch('/api/token/refresh', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshRequestId: requestId })
    });
  } catch (error) {
    // Keep the same request ID: the server may have committed the rotation.
    throw error;
  }

  const body = await readJson(response);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      accessToken = null;
      accessTokenExpiresAt = 0;
      try { localStorage.removeItem(REFRESH_REQUEST_ID_KEY); } catch {}
    }
    throw errorFromResponse(response, body);
  }

  const token = saveAccessToken(response, body);
  // Clear only after the new Access Token has been received and stored in memory.
  try { localStorage.removeItem(REFRESH_REQUEST_ID_KEY); } catch {}
  return token;
}

async function withCrossTabRefreshLock(callback) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('enoparking-token-refresh-v1', { mode: 'exclusive' }, callback);
  }
  // Without a cross-tab lock, concurrent tabs could be mistaken for token replay.
  throw new Error('TOKEN_REFRESH_LOCK_UNAVAILABLE');
}

export async function initializeEventSyncAuth() {
  if (!ENABLED) return null;
  if (tokenIsUsable()) return accessToken;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      return await exchangeSessionCookie();
    } catch (error) {
      if (error?.code !== 'TOKEN_FAMILY_EXISTS') throw error;
      return refreshEventSyncToken();
    }
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export async function refreshEventSyncToken() {
  if (!ENABLED) throw new Error('EVENT_SYNC_DISABLED');
  if (refreshPromise) return refreshPromise;

  refreshPromise = withCrossTabRefreshLock(async () => {
    if (tokenIsUsable()) return accessToken;
    return performRefresh();
  });

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function getEventSyncAccessToken() {
  if (!ENABLED) throw new Error('EVENT_SYNC_DISABLED');
  if (tokenIsUsable()) return accessToken;
  if (accessToken) return refreshEventSyncToken();
  return initializeEventSyncAuth();
}

export function clearEventSyncAuth() {
  accessToken = null;
  accessTokenExpiresAt = 0;
  bootstrapPromise = null;
  refreshPromise = null;
  try { localStorage.removeItem(REFRESH_REQUEST_ID_KEY); } catch {}
}

export async function requestWithEventSyncAuth(path, options = {}) {
  const token = await getEventSyncAccessToken();
  const send = bearer => fetch(path, {
    ...options,
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${bearer}`
    }
  });

  let response = await send(token);
  const body = response.status === 401 || response.status === 403
    ? await readJson(response.clone())
    : null;
  if (response.status === 401 && body?.error?.code === 'TOKEN_EXPIRED') {
    const freshToken = await refreshEventSyncToken();
    response = await send(freshToken);
    return response;
  }
  if (response.status === 401 || body?.error?.code === 'ACCOUNT_LOCKED') {
    accessToken = null;
    accessTokenExpiresAt = 0;
  }
  return response;
}
