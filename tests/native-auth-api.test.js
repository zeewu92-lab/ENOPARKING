import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeAuthApi, NativeAuthApiError } from '../apps/mobile/src/auth/NativeAuthApi.js';

const pair = (accountId = 'account_a') => ({
  accountId,
  accessToken: 'a'.repeat(48),
  refreshToken: 'r'.repeat(48),
  expiresAt: Date.now() + 60000,
});

test('native auth API uses JSON bearer-token contract without cookie credentials', async () => {
  const calls = [];
  const api = new NativeAuthApi({
    baseUrl: 'https://api.example.test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => pair() };
    },
  });
  const result = await api.login({ username: 'learner_1', password: 'password123' });
  assert.equal(result.accountId, 'account_a');
  assert.equal(calls[0].url, 'https://api.example.test/api/token/native-login');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].options.body), { username: 'learner_1', password: 'password123' });
});

test('native auth API sends durable refresh request id and checks account binding', async () => {
  let body;
  const api = new NativeAuthApi({
    baseUrl: 'https://api.example.test',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => pair('account_b') };
    },
  });
  await assert.rejects(api.refresh({
    accountId: 'account_a',
    refreshToken: 'r'.repeat(48),
    refreshRequestId: 'b6b9e8b4-7d11-4f2d-9a8b-112233445566',
  }), /NATIVE_AUTH_ACCOUNT_MISMATCH/);
  assert.equal(body.refreshRequestId, 'b6b9e8b4-7d11-4f2d-9a8b-112233445566');
});

test('native auth API rejects non-HTTPS production endpoints', () => {
  assert.throws(() => new NativeAuthApi({ baseUrl: 'http://api.example.test', fetchImpl: async () => ({}) }), /NATIVE_AUTH_HTTPS_REQUIRED/);
});

test('native auth API preserves retryable server errors', async () => {
  const api = new NativeAuthApi({
    baseUrl: 'https://api.example.test',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: { code: 'TOKEN_AUTH_DISABLED', retryable: true } }) }),
  });
  await assert.rejects(api.login({ username: 'learner_1', password: 'password123' }), error =>
    error instanceof NativeAuthApiError && error.code === 'TOKEN_AUTH_DISABLED' && error.retryable === true && error.status === 503);
});
