const TOKEN_KEY_PREFIX = 'enoparking.native.refresh.v1.';
const SESSION_KEY = 'enoparking.native.session.v1';

function validateAccountId(accountId) {
  if (typeof accountId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
    throw new Error('NATIVE_CREDENTIAL_ACCOUNT_INVALID');
  }
}
function validateRefreshToken(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 8192) {
    throw new Error('NATIVE_REFRESH_TOKEN_INVALID');
  }
}
function validateSession(session) {
  if (!session || typeof session.accountId !== 'string') throw new Error('NATIVE_SESSION_INVALID');
  validateAccountId(session.accountId);
  if (typeof session.accessToken !== 'string' || session.accessToken.length < 40) {
    throw new Error('NATIVE_ACCESS_TOKEN_INVALID');
  }
  if (!Number.isSafeInteger(session.expiresAt) || session.expiresAt <= 0) {
    throw new Error('NATIVE_ACCESS_EXPIRY_INVALID');
  }
}

/**
 * SecureStore-backed refresh token vault shared by Android and iOS.
 * Access tokens remain memory-only. Refresh token rotation must be performed
 * by the injected server adapter; persistence is account-scoped and ordered.
 */
export class NativeCredentialVault {
  constructor({ secureStore, now = () => Date.now() } = {}) {
    if (!secureStore || typeof secureStore.getItemAsync !== 'function' ||
        typeof secureStore.setItemAsync !== 'function' ||
        typeof secureStore.deleteItemAsync !== 'function') {
      throw new Error('NATIVE_SECURE_STORE_ADAPTER_REQUIRED');
    }
    if (typeof now !== 'function') throw new Error('NATIVE_CREDENTIAL_CLOCK_INVALID');
    this.secureStore = secureStore;
    this.now = now;
    this.session = null;
    this.refreshInFlight = new Map();
  }

  async saveLogin({ accountId, accessToken, refreshToken, expiresAt }) {
    validateAccountId(accountId);
    validateRefreshToken(refreshToken);
    const session = { accountId, accessToken, expiresAt };
    validateSession(session);
    // Persist new account's refresh token before switching the in-memory session.
    await this.secureStore.setItemAsync(TOKEN_KEY_PREFIX + accountId, refreshToken);
    this.session = session;
    await this.secureStore.setItemAsync(SESSION_KEY, JSON.stringify({ accountId }));
    return { ...session };
  }

  getActiveSession() {
    if (!this.session || this.session.expiresAt <= this.now()) return null;
    return { ...this.session };
  }

  async getAccessCredentials(accountId) {
    validateAccountId(accountId);
    const session = this.getActiveSession();
    if (!session || session.accountId !== accountId) return null;
    return { accountId, accessToken: session.accessToken };
  }

  async getRefreshToken(accountId) {
    validateAccountId(accountId);
    return this.secureStore.getItemAsync(TOKEN_KEY_PREFIX + accountId);
  }

  async rotateRefreshToken({ accountId, refresh }) {
    validateAccountId(accountId);
    if (typeof refresh !== 'function') throw new Error('NATIVE_REFRESH_ADAPTER_REQUIRED');
    if (this.refreshInFlight.has(accountId)) return this.refreshInFlight.get(accountId);
    const operation = (async () => {
      const session = this.getActiveSession();
      if (!session || session.accountId !== accountId) throw new Error('NATIVE_SESSION_ACCOUNT_MISMATCH');
      const oldRefreshToken = await this.getRefreshToken(accountId);
      validateRefreshToken(oldRefreshToken);
      const next = await refresh({ accountId, refreshToken: oldRefreshToken });
      if (!next || next.accountId !== accountId) throw new Error('NATIVE_REFRESH_ACCOUNT_MISMATCH');
      validateSession(next);
      validateRefreshToken(next.refreshToken);
      // Store rotated token first. If persistence fails, do not expose the new access token.
      await this.secureStore.setItemAsync(TOKEN_KEY_PREFIX + accountId, next.refreshToken);
      this.session = { accountId, accessToken: next.accessToken, expiresAt: next.expiresAt };
      return { ...this.session };
    })();
    this.refreshInFlight.set(accountId, operation);
    try {
      return await operation;
    } finally {
      if (this.refreshInFlight.get(accountId) === operation) this.refreshInFlight.delete(accountId);
    }
  }

  async logout({ revoke } = {}) {
    const session = this.session;
    this.session = null;
    if (!session) return { status: 'signed_out' };
    const key = TOKEN_KEY_PREFIX + session.accountId;
    const refreshToken = await this.secureStore.getItemAsync(key);
    try {
      if (typeof revoke === 'function' && refreshToken) {
        await revoke({ accountId: session.accountId, refreshToken });
      }
    } finally {
      await this.secureStore.deleteItemAsync(key);
      await this.secureStore.deleteItemAsync(SESSION_KEY);
    }
    return { status: 'signed_out', accountId: session.accountId };
  }

  async restoreSession({ refresh }) {
    if (typeof refresh !== 'function') throw new Error('NATIVE_REFRESH_ADAPTER_REQUIRED');
    const saved = await this.secureStore.getItemAsync(SESSION_KEY);
    if (!saved) return null;
    let metadata;
    try { metadata = JSON.parse(saved); } catch { throw new Error('NATIVE_SESSION_METADATA_CORRUPT'); }
    validateAccountId(metadata?.accountId);
    const refreshToken = await this.getRefreshToken(metadata.accountId);
    if (!refreshToken) {
      await this.secureStore.deleteItemAsync(SESSION_KEY);
      return null;
    }
    validateRefreshToken(refreshToken);
    const next = await refresh({ accountId: metadata.accountId, refreshToken });
    if (!next || next.accountId !== metadata.accountId) throw new Error('NATIVE_REFRESH_ACCOUNT_MISMATCH');
    validateSession(next);
    validateRefreshToken(next.refreshToken);
    await this.secureStore.setItemAsync(TOKEN_KEY_PREFIX + next.accountId, next.refreshToken);
    this.session = { accountId: next.accountId, accessToken: next.accessToken, expiresAt: next.expiresAt };
    return { ...this.session };
  }

  async clearAllLocalCredentials() {
    this.session = null;
    const saved = await this.secureStore.getItemAsync(SESSION_KEY);
    if (saved) {
      try {
        const metadata = JSON.parse(saved);
        validateAccountId(metadata.accountId);
        await this.secureStore.deleteItemAsync(TOKEN_KEY_PREFIX + metadata.accountId);
      } catch { /* invalid metadata must not be used to form a storage key */ }
    }
    await this.secureStore.deleteItemAsync(SESSION_KEY);
  }
}
