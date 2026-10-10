import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAuthSession } from '../apps/mobile/src/auth/NativeAuthSession.js';

function makeVault() {
  const calls = [];
  return {
    calls,
    async saveLogin(input) { calls.push(['saveLogin', input]); return { accountId: input.accountId, accessToken: input.accessToken, expiresAt: input.expiresAt }; },
    async restoreSession(input) { calls.push(['restoreSession']); return input.refresh({ accountId: 'acct', refreshToken: 'r'.repeat(48), refreshRequestId: 'b6b9e8b4-7d11-4f2d-9a8b-112233445566' }); },
    async rotateRefreshToken(input) { calls.push(['rotateRefreshToken', input.accountId]); return input.refresh({ accountId: input.accountId, refreshToken: 'r'.repeat(48), refreshRequestId: 'b6b9e8b4-7d11-4f2d-9a8b-112233445566' }); },
    async logout(input) { calls.push(['logout']); return input.revoke({ accountId: 'acct', refreshToken: 'r'.repeat(48) }).then(() => ({ status: 'signed_out', accountId: 'acct' })); },
    getActiveSession() { return null; },
    async getAccessCredentials() { return null; },
  };
}

test('native auth session connects login, restore, refresh, and device logout to vault', async () => {
  const vault = makeVault();
  const api = {
    async login() { return { accountId: 'acct', accessToken: 'a'.repeat(48), refreshToken: 'r'.repeat(48), expiresAt: Date.now() + 60000 }; },
    async refresh(input) { return { accountId: input.accountId, accessToken: 'a'.repeat(48), refreshToken: 'n'.repeat(48), expiresAt: Date.now() + 60000 }; },
    async revoke(input) { assert.equal(input.accountId, 'acct'); return { ok: true }; },
  };
  const auth = createNativeAuthSession({ api, vault });
  const login = await auth.login({ username: 'learner_1', password: 'password123' });
  assert.equal(login.accountId, 'acct');
  assert.equal((await auth.restore()).accountId, 'acct');
  assert.equal((await auth.refresh('acct')).accountId, 'acct');
  assert.equal((await auth.logout()).status, 'signed_out');
  assert.deepEqual(vault.calls.map(call => call[0]), ['saveLogin', 'restoreSession', 'rotateRefreshToken', 'logout']);
});

test('native auth session requires API and secure vault adapters', () => {
  assert.throws(() => createNativeAuthSession({ api: {}, vault: {} }), /NATIVE_AUTH_API_REQUIRED/);
});
