import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeEventSyncService } from '../apps/mobile/src/sync/NativeEventSyncService.js';

const deviceId = 'a6b2c5d7-1f4a-4b6e-8a0c-123456789abc';
const token = 't'.repeat(48);
function fakeStore(overrides = {}) {
  const state = { cursor: 0, ack: [], replay: [], failures: [] };
  return {
    state,
    async getReplayCursor() { return state.cursor; },
    async pendingForSync() { return [{ eventId: 'e1', localCounter: 1, type: 'action', payload: {}, createdAt: 10 }]; },
    async reconcileAcks(_account, acks) { state.ack.push(...acks); },
    async recordSyncFailure(_account, ids, code) { state.failures.push({ ids, code }); },
    async applyReplay(_account, events, applyEvent) {
      for (const event of events) {
        await applyEvent(null, event);
        state.replay.push(event.eventId);
        state.cursor = event.serverSequence;
      }
      return { appliedCount: events.length };
    },
    ...overrides,
  };
}
function serviceOptions(store, overrides = {}) {
  return {
    store,
    getCredentials: async accountId => ({ accountId, accessToken: token }),
    getDeviceId: () => deviceId,
    pushEvents: async ({ events }) => ({ results: events.map(event => ({ eventId: event.eventId, syncStatus: 'confirmed', serverSequence: 1, error: null })) }),
    pullEvents: async ({ afterSequence }) => ({ events: [], nextSequence: afterSequence, hasMore: false }),
    applyEvent: async () => {},
    ...overrides,
  };
}

test('native sync service validates account-bound credentials before sending events', async () => {
  const store = fakeStore();
  const service = new NativeEventSyncService(serviceOptions(store, {
    getCredentials: async () => ({ accountId: 'account-b', accessToken: token }),
  }));
  await assert.rejects(service.syncAccount('account-a'), /NATIVE_SYNC_CREDENTIAL_ACCOUNT_MISMATCH/);
  assert.equal(store.state.ack.length, 0);
});

test('native sync service pushes stable event IDs and reconciles confirmed ACKs', async () => {
  const store = fakeStore();
  let request;
  const service = new NativeEventSyncService(serviceOptions(store, {
    pushEvents: async value => {
      request = value;
      return { results: [{ eventId: 'e1', syncStatus: 'confirmed', serverSequence: 1 }] };
    },
  }));
  const result = await service.syncAccount('account-a');
  assert.equal(request.events[0].eventId, 'e1');
  assert.equal(request.deviceId, deviceId);
  assert.deepEqual(store.state.ack, [{ eventId: 'e1', serverSequence: 1 }]);
  assert.equal(result.status, 'synced');
  assert.equal(result.confirmed, 1);
});

test('native sync service schedules retry for transient push failures without changing event identity', async () => {
  const store = fakeStore();
  const service = new NativeEventSyncService(serviceOptions(store, {
    pushEvents: async () => ({ results: [{
      eventId: 'e1', syncStatus: 'failed', serverSequence: null,
      error: { code: 'RATE_LIMITED', retryable: true }
    }] }),
  }));
  const result = await service.syncAccount('account-a');
  assert.equal(result.retried, 1);
  assert.deepEqual(store.state.failures, [{ ids: ['e1'], code: 'RATE_LIMITED' }]);
});

test('native sync service stops before touching another account after a session switch', async () => {
  const store = fakeStore();
  const service = new NativeEventSyncService(serviceOptions(store));
  const result = await service.syncAccount('account-a', { isCurrentAccount: async () => false });
  assert.equal(result.status, 'account_changed');
  assert.equal(store.state.ack.length, 0);
});

test('native sync service refuses cursor jumps and non-contiguous pull pages', async () => {
  const store = fakeStore();
  const service = new NativeEventSyncService(serviceOptions(store, {
    pendingForSync: async () => [],
    pullEvents: async () => ({
      events: [{ eventId: 'e2', type: 'action', payload: {}, createdAt: 10, serverSequence: 2 }],
      nextSequence: 2,
      hasMore: false,
    }),
  }));
  await assert.rejects(service.syncAccount('account-a'), /NATIVE_SYNC_PULL_SEQUENCE_GAP/);
});
