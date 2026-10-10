const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class NativeAuthApiError extends Error {
  constructor(code, status, retryable = false) {
    super(code || 'NATIVE_AUTH_REQUEST_FAILED');
    this.name = 'NativeAuthApiError';
    this.code = code || 'NATIVE_AUTH_REQUEST_FAILED';
    this.status = status;
    this.retryable = Boolean(retryable);
  }
}

export class NativeAuthApi {
  constructor({ baseUrl, fetchImpl = globalThis.fetch } = {}) {
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new Error('NATIVE_AUTH_BASE_URL_REQUIRED');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('NATIVE_AUTH_HTTPS_REQUIRED');
    }
    if (typeof fetchImpl !== 'function') throw new Error('NATIVE_AUTH_FETCH_REQUIRED');
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async request(action, payload) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/token/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(payload),
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const error = body?.error || {};
      throw new NativeAuthApiError(error.code, response.status, error.retryable);
    }
    if (!body || typeof body !== 'object') throw new NativeAuthApiError('NATIVE_AUTH_RESPONSE_INVALID', response.status);
    return body;
  }

  async login({ username, password }) {
    if (typeof username !== 'string' || typeof password !== 'string') throw new Error('NATIVE_AUTH_CREDENTIALS_INVALID');
    const result = await this.request('native-login', { username, password });
    return this.validateTokenPair(result);
  }

  async refresh({ accountId, refreshToken, refreshRequestId }) {
    if (typeof accountId !== 'string' || !accountId || typeof refreshToken !== 'string' ||
        !UUID_V4.test(String(refreshRequestId || ''))) {
      throw new Error('NATIVE_AUTH_REFRESH_REQUEST_INVALID');
    }
    const result = await this.request('native-refresh', { refreshToken, refreshRequestId });
    const pair = this.validateTokenPair(result);
    if (pair.accountId !== accountId) throw new Error('NATIVE_AUTH_ACCOUNT_MISMATCH');
    return pair;
  }

  async revoke({ accountId, refreshToken }) {
    if (typeof accountId !== 'string' || !accountId || typeof refreshToken !== 'string') {
      throw new Error('NATIVE_AUTH_REVOKE_REQUEST_INVALID');
    }
    return this.request('native-logout', { refreshToken });
  }

  validateTokenPair(value) {
    if (typeof value.accountId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.accountId) ||
        typeof value.accessToken !== 'string' || value.accessToken.length < 40 ||
        typeof value.refreshToken !== 'string' || value.refreshToken.length < 40 ||
        !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()) {
      throw new NativeAuthApiError('NATIVE_AUTH_RESPONSE_INVALID', 502);
    }
    return {
      accountId: value.accountId,
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt,
    };
  }
}
