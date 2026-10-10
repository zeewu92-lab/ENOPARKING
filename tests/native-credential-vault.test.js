import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeCredentialVault } from '../apps/mobile/src/auth/NativeCredentialVault.js';

const token = n => String(n).repeat(48);
const session = (accountId = 'account_a', refreshToken = token('r'), accessToken = token('a'), expiresAt = 200000) =>
  ({ accountId, refreshToken, accessToken, expiresAt });

function fakeSecureStore() {
  const values = new Map();
  return {
    values,
    async getItemAsync(key) { return values.has(key) ? values.get(key) : null; },
    async setItemAsync(key, value) { values.set(key, value); },
    async deleteItemAsync(key) { values.delete(key); },
  };
}

test('native credential vault keeps access tokens in memory and refresh tokens account-scoped in secure storage', async () => {
  const secureStore = fakeSecureStore();
  const vault = new NativeCredentialVault({ secureStore, now: () => 100000, createRefreshRequestId: () => 'b6b9e8b4-7d11-4f2d-9a8b-112233445566' });
  await vault.saveLogin(session());
  assert.equal(await vault.getRefreshToken('account_a'), token('r'));
  assert.deepEqual(await vault.getAccessCredentials('account_a'), { accountId: 'account_a', accessToken: token('a') });
  assert.equal(await vault.getAccessCredentials('account_b'), null);
  assert.equal(secureStore.values.get('enoparking.native.session.v1.'), JSON.stringify({ accountId: 'account_a' }));
  assert.equal([...secureStore.values.values()].includes(token('a')), false);
});

test('native credential vault serializes concurrent refresh-token rotation for one account', async () => {
  const secureStore = fakeSecureStore();
  const vault = new NativeCredentialVault({ secureStore, now: () => 100000 });
  await vault.saveLogin(session());
  let calls = 0;
  let release;
  const refresh = async ({ accountId, refreshToken }) => {
    calls += 1;
    assert.equal(accountId, 'account_a');
    assert.equal(refreshToken, token('r'));
    await new Promise(resolve => { release = resolve; });
    return session(accountId, token('n'), token('b'), 300000);
  };
  const first = vault.rotateRefreshToken({ accountId: 'account_a', refresh });
  await new Promise(resolve => setImmediate(resolve));
  const second = vault.rotateRefreshToken({ accountId: 'account_a', refresh });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(await vault.getRefreshToken('account_a'), token('n'));
});

test('native credential vault rejects refresh results for another account without changing session', async () => {
  const secureStore = fakeSecureStore();
  const vault = new NativeCredentialVault({ secureStore, now: () => 100000 });
  await vault.saveLogin(session());
  await assert.rejects(vault.rotateRefreshToken({
    accountId: 'account_a',
    refresh: async () => session('account_b', token('z'), token('x'), 300000),
  }), /NATIVE_REFRESH_ACCOUNT_MISMATCH/);
  assert.equal(vault.getActiveSession().accountId, 'account_a');
  assert.equal(await vault.getRefreshToken('account_a'), token('r'));
});

test('native credential vault restores session through server refresh and rotates stored token', async () => {
  const secureStore = fakeSecureStore();
  const first = new NativeCredentialVault({ secureStore, now: () => 100000 });
  await first.saveLogin(session());
  const restarted = new NativeCredentialVault({ secureStore, now: () => 100000 });
  const restored = await restarted.restoreSession({
    refresh: async ({ accountId, refreshToken }) => {
      assert.equal(accountId, 'account_a');
      assert.equal(refreshToken, token('r'));
      return session(accountId, token('n'), token('b'), 300000);
    },
  });
  assert.equal(restored.accessToken, token('b'));
  assert.equal(await restarted.getRefreshToken('account_a'), token('n'));
});

test('native credential vault revokes then deletes credentials on logout', async () => {
  const secureStore = fakeSecureStore();
  const vault = new NativeCredentialVault({ secureStore, now: () => 100000 });
  await vault.saveLogin(session());
  let revoked;
  const result = await vault.logout({ revoke: async input => { revoked = input; } });
  assert.equal(revoked.refreshToken, token('r'));
  assert.equal(result.status, 'signed_out');
  assert.equal(await vault.getRefreshToken('account_a'), null);
  assert.equal(vault.getActiveSession(), null);
});

test('native credential vault rejects expired sessions and invalid account identifiers', async () => {
  const vault = new NativeCredentialVault({ secureStore: fakeSecureStore(), now: () => 500000, createRefreshRequestId: () => 'b6b9e8b4-7d11-4f2d-9a8b-112233445566' });
  await vault.saveLogin(session('account_a', token('r'), token('a'), 200000));
  assert.equal(vault.getActiveSession(), null);
  await assert.rejects(vault.getRefreshToken('../other'), /NATIVE_CREDENTIAL_ACCOUNT_INVALID/);
});

test('native credential vault can refresh an expired access token while session identity remains active', async () => {
  const secureStore = fakeSecureStore();
  const vault = new NativeCredentialVault({ secureStore, now: () => 500000, createRefreshRequestId: () => 'b6b9e8b4-7d11-4f2d-9a8b-112233445566' });
  await vault.saveLogin(session('account_a', token('r'), token('a'), 200000));
  assert.equal(vault.getActiveSession(), null);
  const next = await vault.rotateRefreshToken({
    accountId: 'account_a',
    refresh: async ({ accountId }) => session(accountId, token('n'), token('b'), 800000),
  });
  assert.equal(next.accessToken, token('b'));
});

test('native credential vault can logout after app restart even before session restoration', async () => {
  const secureStore = fakeSecureStore();
  const first = new NativeCredentialVault({ secureStore, now: () => 100000 });
  await first.saveLogin(session());
  const restarted = new NativeCredentialVault({ secureStore, now: () => 100000 });
  let revokedAccount;
  await restarted.logout({ revoke: async ({ accountId }) => { revokedAccount = accountId; } });
  assert.equal(revokedAccount, 'account_a');
  assert.equal(await secureStore.getItemAsync('enoparking.native.refresh.v1.account_a'), null);
  assert.equal(await secureStore.getItemAsync('enoparking.native.session.v1'), null);
});
