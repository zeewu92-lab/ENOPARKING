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

test('native sync service rejects a pull cursor that skips beyond delivered events', async () => {
  const store = fakeStore({ pendingForSync: async () => [] });
  const service = new NativeEventSyncService(serviceOptions(store, {
    pullEvents: async () => ({
      events: [{
        eventId: 'e1',
        type: 'action',
        payload: { wordId: 'word-1', day: 1, verification: 'choice', result: 'correct', hintLevel: 'none' },
        createdAt: 10,
        serverSequence: 1,
      }],
      // A cursor of 2 would skip sequence 2 even though this page only delivered sequence 1.
      nextSequence: 2,
      hasMore: false,
    }),
  }));

  await assert.rejects(service.syncAccount('account-a'), /NATIVE_SYNC_PULL_SEQUENCE_GAP/);
  assert.deepEqual(store.state.replay, []);
});
test('native sync discards a late ACK when the active account changes during push', async () => {
  const store = fakeStore();
  let checks = 0;
  let pullCalls = 0;
  const service = new NativeEventSyncService(serviceOptions(store, {
    pullEvents: async ({ afterSequence }) => {
      pullCalls += 1;
      return { events: [], nextSequence: afterSequence, hasMore: false };
    },
  }));
  const result = await service.syncAccount('account-a', {
    isCurrentAccount: async () => {
      checks += 1;
      return checks < 3;
    },
  });
  assert.equal(result.status, 'account_changed');
  assert.equal(store.state.ack.length, 0);
  assert.equal(pullCalls, 0);
});


test('native sync serializes overlapping requests and does not repush an acknowledged event', async () => {
  let pending = true;
  const state = { cursor: 0, ack: [], replay: [], failures: [] };
  const store = {
    state,
    async getReplayCursor() { return state.cursor; },
    async pendingForSync() {
      return pending ? [{ eventId: 'e1', localCounter: 1, type: 'action', payload: {}, createdAt: 10 }] : [];
    },
    async reconcileAcks(_account, acks) {
      state.ack.push(...acks);
      pending = false;
    },
    async recordSyncFailure(_account, ids, code) { state.failures.push({ ids, code }); },
    async applyReplay(_account, events) {
      state.replay.push(...events.map(event => event.eventId));
      return { appliedCount: events.length };
    },
  };
  let releaseFirst;
  let signalFirstStarted;
  const firstStarted = new Promise(resolve => { signalFirstStarted = resolve; });
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  let activePushes = 0;
  let maxActivePushes = 0;
  let pushCalls = 0;
  const service = new NativeEventSyncService(serviceOptions(store, {
    pushEvents: async ({ events }) => {
      pushCalls += 1;
      activePushes += 1;
      maxActivePushes = Math.max(maxActivePushes, activePushes);
      signalFirstStarted();
      await firstGate;
      activePushes -= 1;
      return { results: events.map(event => ({
        eventId: event.eventId,
        syncStatus: 'confirmed',
        serverSequence: 1,
      })) };
    },
  }));

  const first = service.syncAccount('account-a');
  await firstStarted;
  const second = service.syncAccount('account-a');
  await Promise.resolve();
  assert.equal(pushCalls, 1);
  releaseFirst();
  const results = await Promise.all([first, second]);
  assert.equal(maxActivePushes, 1);
  assert.equal(pushCalls, 1);
  assert.deepEqual(state.ack, [{ eventId: 'e1', serverSequence: 1 }]);
  assert.equal(results.every(result => result.status === 'synced'), true);
});

test('native sync rejects empty or oversized pull pages before replay', async () => {
  const emptyStore = fakeStore({ pendingForSync: async () => [] });
  const emptyService = new NativeEventSyncService(serviceOptions(emptyStore, {
    pullEvents: async ({ afterSequence }) => ({
      events: [],
      nextSequence: afterSequence,
      hasMore: true,
    }),
  }));
  await assert.rejects(emptyService.syncAccount('account-a'), /NATIVE_SYNC_PULL_RESPONSE_INVALID/);
  assert.deepEqual(emptyStore.state.replay, []);

  const oversizedStore = fakeStore({ pendingForSync: async () => [] });
  const oversizedEvents = Array.from({ length: 101 }, (_, index) => ({
    eventId: `event-${index + 1}`,
    type: 'action',
    payload: { wordId: `word-${index + 1}`, day: 1, verification: 'choice', result: 'correct', hintLevel: 'none' },
    createdAt: 10,
    serverSequence: index + 1,
  }));
  const oversizedService = new NativeEventSyncService(serviceOptions(oversizedStore, {
    pullEvents: async () => ({
      events: oversizedEvents,
      nextSequence: 101,
      hasMore: false,
    }),
  }));
  await assert.rejects(oversizedService.syncAccount('account-a'), /NATIVE_SYNC_PULL_RESPONSE_INVALID/);
  assert.deepEqual(oversizedStore.state.replay, []);
});

