const TOKEN_KEY_PREFIX = 'enoparking.native.refresh.v1.';
const SESSION_KEY = 'enoparking.native.session.v1';
const REFRESH_REQUEST_PREFIX = 'enoparking.native.refresh-request.v1.';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  constructor({ secureStore, now = () => Date.now(), createRefreshRequestId } = {}) {
    if (!secureStore || typeof secureStore.getItemAsync !== 'function' ||
        typeof secureStore.setItemAsync !== 'function' ||
        typeof secureStore.deleteItemAsync !== 'function') {
      throw new Error('NATIVE_SECURE_STORE_ADAPTER_REQUIRED');
    }
    if (typeof now !== 'function') throw new Error('NATIVE_CREDENTIAL_CLOCK_INVALID');
    if (typeof createRefreshRequestId !== 'function') throw new Error('NATIVE_REFRESH_REQUEST_ID_PROVIDER_REQUIRED');
    this.secureStore = secureStore;
    this.now = now;
    this.createRefreshRequestId = createRefreshRequestId;
    this.session = null;
    this.refreshInFlight = new Map();
    this.loggingOut = new Set();
    this.lifecycleQueue = Promise.resolve();
    this.sessionRestoreInFlight = null;
  }

  withLifecycleLock(operation) {
    const next = this.lifecycleQueue.then(operation, operation);
    this.lifecycleQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async saveLogin(input) {
    const { accountId, accessToken, refreshToken, expiresAt } = input || {};
    return this.withLifecycleLock(async () => {
      validateAccountId(accountId);
      validateRefreshToken(refreshToken);
      const session = { accountId, accessToken, expiresAt };
      validateSession(session);
      if (this.loggingOut.has(accountId)) throw new Error('NATIVE_LOGOUT_IN_PROGRESS');
      // Persist new account's refresh token before switching the in-memory session.
      await this.secureStore.setItemAsync(TOKEN_KEY_PREFIX + accountId, refreshToken);
      await this.secureStore.setItemAsync(SESSION_KEY, JSON.stringify({ accountId }));
      this.session = session;
      return { ...session };
    });
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

  async getOrCreateRefreshRequestId(accountId) {
    const key = REFRESH_REQUEST_PREFIX + accountId;
    const existing = await this.secureStore.getItemAsync(key);
    if (existing && UUID_V4.test(existing)) return existing;
    const requestId = await this.createRefreshRequestId();
    if (typeof requestId !== 'string' || !UUID_V4.test(requestId)) {
      throw new Error('NATIVE_REFRESH_REQUEST_ID_INVALID');
    }
    await this.secureStore.setItemAsync(key, requestId);
    return requestId;
  }

  async rotateRefreshToken({ accountId, refresh }) {
    validateAccountId(accountId);
    if (typeof refresh !== 'function') throw new Error('NATIVE_REFRESH_ADAPTER_REQUIRED');
    if (this.loggingOut.has(accountId)) throw new Error('NATIVE_LOGOUT_IN_PROGRESS');
    if (this.refreshInFlight.has(accountId)) return this.refreshInFlight.get(accountId);
    const operation = (async () => {
      const session = this.session;
      if (!session || session.accountId !== accountId) throw new Error('NATIVE_SESSION_ACCOUNT_MISMATCH');
      const oldRefreshToken = await this.getRefreshToken(accountId);
      validateRefreshToken(oldRefreshToken);
      const refreshRequestId = await this.getOrCreateRefreshRequestId(accountId);
      const next = await refresh({ accountId, refreshToken: oldRefreshToken, refreshRequestId });
      if (!next || next.accountId !== accountId) throw new Error('NATIVE_REFRESH_ACCOUNT_MISMATCH');
      validateSession(next);
      validateRefreshToken(next.refreshToken);
      // Store rotated token first. If persistence fails, do not expose the new access token.
      await this.secureStore.setItemAsync(TOKEN_KEY_PREFIX + accountId, next.refreshToken);
      await this.secureStore.deleteItemAsync(REFRESH_REQUEST_PREFIX + accountId);
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

  async logout(options = {}) {
    const { revoke } = options;
    return this.withLifecycleLock(async () => {
      const active = this.session;
      let saved = null;
      let sessionReadError = null;
      try {
        saved = await this.secureStore.getItemAsync(SESSION_KEY);
      } catch (error) {
        sessionReadError = error;
        if (!active?.accountId) throw error;
      }

      let accountId = active?.accountId;
      if (!accountId && saved) {
        try {
          const metadata = JSON.parse(saved);
          validateAccountId(metadata?.accountId);
          accountId = metadata.accountId;
        } catch {
          await this.secureStore.deleteItemAsync(SESSION_KEY);
          return { status: 'signed_out' };
        }
      }
      if (!accountId) {
        this.session = null;
        await this.secureStore.deleteItemAsync(SESSION_KEY);
        if (sessionReadError) throw sessionReadError;
        return { status: 'signed_out' };
      }

      this.loggingOut.add(accountId);
      try {
        // Finish an in-flight rotation first so logout revokes the latest token.
        const rotation = this.refreshInFlight.get(accountId);
        if (rotation) {
          try { await rotation; } catch { /* still clear local credentials below */ }
        }
        if (this.session?.accountId === accountId) this.session = null;
        const key = TOKEN_KEY_PREFIX + accountId;
        let refreshToken = null;
        try {
          refreshToken = await this.secureStore.getItemAsync(key);
          if (typeof revoke === 'function' && refreshToken) {
            await revoke({ accountId, refreshToken });
          }
        } finally {
          // Attempt every cleanup even if SecureStore fails on one key.
          const cleanup = await Promise.allSettled([
            this.secureStore.deleteItemAsync(key),
            this.secureStore.deleteItemAsync(REFRESH_REQUEST_PREFIX + accountId),
            this.secureStore.deleteItemAsync(SESSION_KEY),
          ]);
          const failedCleanup = cleanup.find(result => result.status === 'rejected');
          if (failedCleanup) throw failedCleanup.reason;
        }
        return { status: 'signed_out', accountId };
      } finally {
        this.loggingOut.delete(accountId);
      }
    });
  }

  restoreSession(options = {}) {
    if (this.sessionRestoreInFlight) return this.sessionRestoreInFlight;
    const { refresh } = options;
    const operation = this.withLifecycleLock(async () => {
      if (typeof refresh !== 'function') throw new Error('NATIVE_REFRESH_ADAPTER_REQUIRED');
      const saved = await this.secureStore.getItemAsync(SESSION_KEY);
      if (!saved) return null;
      let metadata;
      try { metadata = JSON.parse(saved); } catch { throw new Error('NATIVE_SESSION_METADATA_CORRUPT'); }
      validateAccountId(metadata?.accountId);
      const accountId = metadata.accountId;
      if (this.loggingOut.has(accountId)) throw new Error('NATIVE_LOGOUT_IN_PROGRESS');
      if (this.refreshInFlight.has(accountId)) return this.refreshInFlight.get(accountId);

      const operation = (async () => {
        const refreshToken = await this.getRefreshToken(accountId);
        if (!refreshToken) {
          await this.secureStore.deleteItemAsync(SESSION_KEY);
          return null;
        }
        validateRefreshToken(refreshToken);
        const refreshRequestId = await this.getOrCreateRefreshRequestId(accountId);
        const next = await refresh({ accountId, refreshToken, refreshRequestId });
        if (!next || next.accountId !== accountId) throw new Error('NATIVE_REFRESH_ACCOUNT_MISMATCH');
        validateSession(next);
        validateRefreshToken(next.refreshToken);
        await this.secureStore.setItemAsync(TOKEN_KEY_PREFIX + next.accountId, next.refreshToken);
        await this.secureStore.deleteItemAsync(REFRESH_REQUEST_PREFIX + next.accountId);
        this.session = { accountId: next.accountId, accessToken: next.accessToken, expiresAt: next.expiresAt };
        return { ...this.session };
      })();
      this.refreshInFlight.set(accountId, operation);
      try {
        return await operation;
      } finally {
        if (this.refreshInFlight.get(accountId) === operation) this.refreshInFlight.delete(accountId);
      }
    });
    this.sessionRestoreInFlight = operation;
    return operation.finally(() => {
      if (this.sessionRestoreInFlight === operation) this.sessionRestoreInFlight = null;
    });
  }

  async clearAllLocalCredentials() {
    return this.withLifecycleLock(async () => {
      this.session = null;
      let metadata = null;
      const saved = await this.secureStore.getItemAsync(SESSION_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          validateAccountId(parsed.accountId);
          metadata = parsed;
        } catch { /* invalid metadata must not be used to form a storage key */ }
      }
      const keys = metadata
        ? [TOKEN_KEY_PREFIX + metadata.accountId, REFRESH_REQUEST_PREFIX + metadata.accountId, SESSION_KEY]
        : [SESSION_KEY];
      const cleanup = await Promise.allSettled(keys.map(key => this.secureStore.deleteItemAsync(key)));
      const failedCleanup = cleanup.find(result => result.status === 'rejected');
      if (failedCleanup) throw failedCleanup.reason;
    });
  }

}
