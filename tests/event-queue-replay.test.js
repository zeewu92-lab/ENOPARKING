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
  const queue = new EventQueue({ storage, now: () => 1791500000000, createId: makeIds() });
  const first = queue.enqueue({ type: 'action', payload: { action: 'remember', wordId: 'w-1' } });
  const second = queue.enqueue({ type: 'unit_outcome', payload: { unitId: 'u-1', correct: true } });

  assert.equal(first.localCounter, 1);
  assert.equal(second.localCounter, 2);
  assert.equal(new EventQueue({ storage }).list().length, 2);
  assert.equal(queue.getDeviceId(), new EventQueue({ storage }).getDeviceId());
});

test('invalid events are rejected before entering the queue', () => {
  const queue = new EventQueue({ storage: makeStorage(), createId: makeIds() });
  assert.throws(() => queue.enqueue({ type: 'unknown', payload: {} }), /EVENT_TYPE_UNKNOWN/);
  assert.throws(() => queue.enqueue({ type: 'action', payload: [] }), /EVENT_PAYLOAD_INVALID/);
  assert.equal(queue.list().length, 0);
});

test('sync reconciliation records confirmations and schedules retryable failures', () => {
  let now = 11;
  const queue = new EventQueue({ storage: makeStorage(), now: () => now, createId: makeIds() });
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
  const queue = new EventQueue({ storage: makeStorage(), createId: makeIds() });
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
  const queue = new EventQueue({ storage: makeStorage(), createId: makeIds() });
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
  const queue = new EventQueue({ storage: makeStorage(), createId: makeIds() });
  await assert.rejects(() => replayEvents({
    queue,
    clientVersion: '1.0.0',
    push: async () => ({ results: [] }),
    pull: async () => ({ events: [], nextSequence: 5, hasMore: true }),
    applyEvent: async () => {}
  }), /EVENT_PULL_CURSOR_GAP/);
});
