import test from 'node:test';
import assert from 'node:assert/strict';
import { EventQueue } from '../src/api/eventQueue.js';
import { replayEvents } from '../src/api/eventReplay.js';

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function makeIds() {
  let index = 0;
  return () => `b6d2cfa9-67a7-4e4b-9b0e-${String(++index).padStart(12, '0')}`;
}

test('queue persists events and monotonically increments a device-local counter', () => {
  const storage = makeStorage();
  const queue = new EventQueue({ accountId: 'test-user', storage, now: () => 1791500000000, createId: makeIds() });
  const first = queue.enqueue({ type: 'action', payload: { action: 'remember', wordId: 'w-1' } });
  const second = queue.enqueue({ type: 'unit_outcome', payload: { unitId: 'u-1', correct: true } });

  assert.equal(first.localCounter, 1);
  assert.equal(second.localCounter, 2);
  assert.equal(new EventQueue({ accountId: 'test-user', storage }).list().length, 2);
  assert.equal(queue.getDeviceId(), new EventQueue({ accountId: 'test-user', storage }).getDeviceId());
});

test('event queue requires an account identity and isolates data across accounts', () => {
  const storage = makeStorage();
  assert.throws(() => new EventQueue({ storage }), /EVENT_QUEUE_ACCOUNT_REQUIRED/);

  const firstAccount = new EventQueue({ accountId: 'user-a', storage, createId: makeIds() });
  const secondAccount = new EventQueue({ accountId: 'user-b', storage, createId: makeIds() });
  const event = firstAccount.enqueue({ type: 'action', payload: { action: 'remember', wordId: 'private-word' } });

  firstAccount.setReplayCursor(4);
  firstAccount.markApplied('remote-user-a');

  assert.equal(firstAccount.list().length, 1);
  assert.equal(secondAccount.list().length, 0);
  assert.equal(firstAccount.getReplayCursor(), 4);
  assert.equal(secondAccount.getReplayCursor(), 0);
  assert.equal(firstAccount.hasApplied('remote-user-a'), true);
  assert.equal(secondAccount.hasApplied('remote-user-a'), false);
  assert.equal(firstAccount.getDeviceId(), secondAccount.getDeviceId());
  assert.ok(event.eventId);
});

test('invalid events are rejected before entering the queue', () => {
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), createId: makeIds() });
  assert.throws(() => queue.enqueue({ type: 'unknown', payload: {} }), /EVENT_TYPE_UNKNOWN/);
  assert.throws(() => queue.enqueue({ type: 'action', payload: [] }), /EVENT_PAYLOAD_INVALID/);
  assert.equal(queue.list().length, 0);
});

test('sync reconciliation records confirmations and schedules retryable failures', () => {
  let now = 11;
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), now: () => now, createId: makeIds() });
  const one = queue.enqueue({ type: 'action', payload: { action: 'remember' }, createdAt: 10 });
  const two = queue.enqueue({ type: 'action', payload: { action: 'forget' }, createdAt: 11 });
  queue.reconcile([
    { eventId: one.eventId, syncStatus: 'confirmed', serverSequence: 7 },
    { eventId: two.eventId, syncStatus: 'failed', error: { code: 'RATE_LIMITED', retryable: true, retryAfterMs: 1000 } }
  ]);

  assert.equal(queue.list()[0].syncStatus, 'confirmed');
  assert.equal(queue.list()[0].serverSequence, 7);
  assert.equal(queue.pendingForSync().length, 0);
  assert.equal(queue.list()[1].attemptCount, 1);
  assert.equal(queue.list()[1].nextAttemptAt, 1011);
  now = 1011;
  assert.equal(queue.pendingForSync().length, 1);
  assert.equal(queue.pendingForSync()[0].eventId, two.eventId);
});

test('replay pushes pending events, applies pulled events once, and persists cursor', async () => {
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), createId: makeIds() });
  const local = queue.enqueue({ type: 'action', payload: { action: 'remember' }, createdAt: 10 });
  const applied = [];
  let pushCalls = 0;
  let pullCalls = 0;

  const opts = {
    queue,
    clientVersion: '1.0.0',
    push: async request => {
      pushCalls += 1;
      assert.equal(request.events[0].eventId, local.eventId);
      return { results: [{ eventId: local.eventId, syncStatus: 'confirmed', serverSequence: 1 }] };
    },
    pull: async ({ afterSequence }) => {
      pullCalls += 1;
      if (afterSequence === 0) {
        return {
          events: [
            { eventId: local.eventId, type: 'action', payload: { action: 'remember' }, serverSequence: 1 },
            { eventId: 'remote-1', type: 'action', payload: { action: 'remember', wordId: 'w-2' }, serverSequence: 2 }
          ],
          nextSequence: 2,
          hasMore: false
        };
      }
      return { events: [], nextSequence: afterSequence, hasMore: false };
    },
    applyEvent: async event => applied.push(event.eventId)
  };

  const first = await replayEvents(opts);
  const second = await replayEvents(opts);
  assert.equal(first.pushed, 1);
  assert.equal(first.replayed, 1);
  assert.equal(first.skipped, 1);
  assert.deepEqual(applied, ['remote-1']);
  assert.equal(second.pushed, 0);
  assert.equal(second.replayed, 0);
  assert.equal(second.skipped, 0);
  assert.equal(pushCalls, 1);
  assert.equal(pullCalls, 2);
  assert.equal(queue.getReplayCursor(), 2);
});

test('failed apply does not advance the replay cursor or mark the event applied', async () => {
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), createId: makeIds() });
  await assert.rejects(() => replayEvents({
    queue,
    clientVersion: '1.0.0',
    push: async () => ({ results: [] }),
    pull: async () => ({
      events: [{ eventId: 'remote-1', type: 'action', payload: {}, serverSequence: 1 }],
      nextSequence: 1,
      hasMore: false
    }),
    applyEvent: async () => { throw new Error('apply failed'); }
  }), /apply failed/);
  assert.equal(queue.getReplayCursor(), 0);
  assert.equal(queue.hasApplied('remote-1'), false);
});

test('replay rejects a server cursor gap instead of silently skipping events', async () => {
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), createId: makeIds() });
  await assert.rejects(() => replayEvents({
    queue,
    clientVersion: '1.0.0',
    push: async () => ({ results: [] }),
    pull: async () => ({ events: [], nextSequence: 5, hasMore: true }),
    applyEvent: async () => {}
  }), /EVENT_PULL_CURSOR_GAP/);
});

test('applied event IDs accumulate independently for each account', () => {
  const storage = makeStorage();
  const first = new EventQueue({ accountId: 'user-a', storage, createId: makeIds() });
  const second = new EventQueue({ accountId: 'user-b', storage, createId: makeIds() });

  first.markApplied('remote-a-1');
  first.markApplied('remote-a-2');
  second.markApplied('remote-b-1');

  assert.equal(first.hasApplied('remote-a-1'), true);
  assert.equal(first.hasApplied('remote-a-2'), true);
  assert.equal(first.hasApplied('remote-b-1'), false);
  assert.equal(second.hasApplied('remote-b-1'), true);
  assert.equal(second.hasApplied('remote-a-1'), false);
});

test('discardPending rolls back an unsynced event and its local applied marker', () => {
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), createId: makeIds() });
  const event = queue.enqueue({
    eventId: 'b6d2cfa9-67a7-4e4b-9b0e-000000000101',
    type: 'action',
    payload: { wordId: 'word-1', day: 20637, verification: 'choice', result: 'correct', hintLevel: 'none' }
  });

  assert.equal(queue.hasApplied(event.eventId), true);
  assert.equal(queue.discardPending(event.eventId), true);
  assert.equal(queue.list().length, 0);
  assert.equal(queue.hasApplied(event.eventId), false);
  assert.equal(queue.discardPending(event.eventId), false);
});

test('discardPending refuses to remove an event after server confirmation', () => {
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), createId: makeIds() });
  const event = queue.enqueue({
    eventId: 'b6d2cfa9-67a7-4e4b-9b0e-000000000102',
    type: 'action',
    payload: { wordId: 'word-1', day: 20637, verification: 'choice', result: 'correct', hintLevel: 'none' }
  });
  queue.reconcile([{ eventId: event.eventId, syncStatus: 'confirmed', serverSequence: 1 }]);
  assert.throws(() => queue.discardPending(event.eventId), /EVENT_ALREADY_SYNCED/);
});


test('enqueue rolls back the queue and applied marker if the marker write fails', () => {
  const values = new Map();
  let failAppliedWrite = true;
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failAppliedWrite && key.includes('event-applied-ids')) {
        failAppliedWrite = false;
        throw new Error('quota exceeded');
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
  const queue = new EventQueue({ accountId: 'test-user', storage, createId: makeIds() });

  const eventId = 'b6d2cfa9-67a7-4e4b-9b0e-000000000103';
  assert.throws(() => queue.enqueue({
    eventId,
    type: 'action',
    payload: { wordId: 'word-1', day: 20637, verification: 'choice', result: 'correct', hintLevel: 'none' }
  }), /EVENT_QUEUE_STORAGE_UNAVAILABLE/);

  assert.equal(queue.list().length, 0);
  assert.equal(queue.readState().localCounter, 0);
  assert.equal(queue.hasApplied(eventId), false);
});


test('discardPending restores the queue if applied-marker cleanup fails', () => {
  const values = new Map();
  let failAppliedWrite = false;
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failAppliedWrite && key.includes('event-applied-ids')) {
        failAppliedWrite = false;
        throw new Error('quota exceeded');
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
  const queue = new EventQueue({ accountId: 'test-user', storage, createId: makeIds() });
  const eventId = 'b6d2cfa9-67a7-4e4b-9b0e-000000000104';
  queue.enqueue({
    eventId,
    type: 'action',
    payload: { wordId: 'word-1', day: 20637, verification: 'choice', result: 'correct', hintLevel: 'none' }
  });

  failAppliedWrite = true;
  assert.throws(() => queue.discardPending(eventId), /EVENT_QUEUE_STORAGE_UNAVAILABLE/);
  assert.equal(queue.list().length, 1);
  assert.equal(queue.hasApplied(eventId), true);
});


test('queue does not accept missing, string, zero, or negative server sequences as confirmation', () => {
  const queue = new EventQueue({ accountId: 'test-user', storage: makeStorage(), createId: makeIds() });
  const event = queue.enqueue({
    eventId: 'b6d2cfa9-67a7-4e4b-9b0e-000000000105',
    type: 'action',
    payload: { wordId: 'word-1', day: 20637, verification: 'choice', result: 'correct', hintLevel: 'none' }
  });

  queue.reconcile([
    { eventId: event.eventId, syncStatus: 'confirmed', serverSequence: null }
  ]);
  assert.equal(queue.list()[0].syncStatus, 'pending');
  assert.equal(queue.list()[0].serverSequence, null);

  for (const invalidSequence of ['1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    queue.reconcile([
      { eventId: event.eventId, syncStatus: 'confirmed', serverSequence: invalidSequence }
    ]);
    assert.equal(queue.list()[0].syncStatus, 'pending');
    assert.equal(queue.list()[0].serverSequence, null);
  }

  queue.reconcile([
    { eventId: event.eventId, syncStatus: 'confirmed', serverSequence: 1 }
  ]);
  assert.equal(queue.list()[0].syncStatus, 'confirmed');
  assert.equal(queue.list()[0].serverSequence, 1);
});
