import { NativeAuthApi } from './NativeAuthApi.js';
import { nativeCredentialVault } from './nativeCredentialVault';

export function createNativeAuthSession({ baseUrl, api = new NativeAuthApi({ baseUrl }), vault = nativeCredentialVault } = {}) {
  if (!api || typeof api.login !== 'function' || typeof api.refresh !== 'function' || typeof api.revoke !== 'function') {
    throw new Error('NATIVE_AUTH_API_REQUIRED');
  }
  if (!vault || typeof vault.saveLogin !== 'function' || typeof vault.restoreSession !== 'function' ||
      typeof vault.rotateRefreshToken !== 'function' || typeof vault.logout !== 'function') {
    throw new Error('NATIVE_CREDENTIAL_VAULT_REQUIRED');
  }

  return {
    async login({ username, password }) {
      const credentials = await api.login({ username, password });
      return vault.saveLogin(credentials);
    },
    async restore() {
      return vault.restoreSession({ refresh: input => api.refresh(input) });
    },
    async refresh(accountId) {
      return vault.rotateRefreshToken({ accountId, refresh: input => api.refresh(input) });
    },
    async logout() {
      return vault.logout({ revoke: input => api.revoke(input) });
    },
    getActiveSession() {
      return vault.getActiveSession();
    },
    getAccessCredentials(accountId) {
      return vault.getAccessCredentials(accountId);
    },
  };
}
