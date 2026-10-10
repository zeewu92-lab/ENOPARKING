import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEventSyncTransport } from '../apps/mobile/src/sync/NativeEventSyncTransport.js';

const token = 's'.repeat(48);
const base = 'https://api.example.test';

test('native transport sends bearer-authenticated push requests to the shared API', async () => {
  let call;
  const transport = createNativeEventSyncTransport({
    baseUrl: base,
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    },
  });
  await transport.pushEvents({ accessToken: token, deviceId: 'device-id', clientVersion: '1.0.0', events: [] });
  assert.equal(call.url, base + '/api/events/sync');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.Authorization, 'Bearer ' + token);
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.options.body), { deviceId: 'device-id', clientVersion: '1.0.0', events: [] });
});

test('native transport pulls a bounded page using account bearer credentials', async () => {
  let call;
  const transport = createNativeEventSyncTransport({
    baseUrl: base,
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, status: 200, json: async () => ({ events: [], nextSequence: 4, hasMore: false }) };
    },
  });
  const result = await transport.pullEvents({ accessToken: token, afterSequence: 4, limit: 50 });
  assert.equal(call.url, base + '/api/events/pull?afterSequence=4&limit=50');
  assert.equal(call.options.headers.Authorization, 'Bearer ' + token);
  assert.equal(result.nextSequence, 4);
});

test('native transport rejects insecure production URLs and malformed requests', async () => {
  assert.throws(() => createNativeEventSyncTransport({ baseUrl: 'http://api.example.test' }), /MUST_USE_HTTPS/);
  assert.throws(() => createNativeEventSyncTransport({ baseUrl: '' }), /BASE_URL_REQUIRED/);
  const transport = createNativeEventSyncTransport({ baseUrl: base, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.throws(() => transport.pullEvents({ accessToken: token, afterSequence: -1 }), /PULL_REQUEST_INVALID/);
});

test('native transport preserves retryable server error metadata', async () => {
  const transport = createNativeEventSyncTransport({
    baseUrl: base,
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 'RATE_LIMITED', retryable: true, retryAfterMs: 5000 } }) }),
  });
  await assert.rejects(
    transport.pullEvents({ accessToken: token, afterSequence: 0 }),
    error => error.code === 'RATE_LIMITED' && error.status === 429 && error.retryable && error.retryAfterMs === 5000
  );
});
