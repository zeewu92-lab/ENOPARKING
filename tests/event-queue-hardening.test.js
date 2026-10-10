import test from 'node:test';
import assert from 'node:assert/strict';
import { EventQueue } from '../src/api/eventQueue.js';

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function makeIds() {
  let value = 0;
  return () => `b6d2cfa9-67a7-4e4b-9b0e-0000000005${String(++value).padStart(6, '0')}`;
}

test('retry backoff grows exponentially, is capped, and does not send early', () => {
  let now = 10000;
  const queue = new EventQueue({
    accountId: 'retry-user',
    storage: makeStorage(),
    now: () => now,
    createId: makeIds()
  });
  const event = queue.enqueue({
    type: 'action',
    payload: { action: 'remember', wordId: 'retry-word' },
    createdAt: now
  });

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    queue.reconcile([{
      eventId: event.eventId,
      syncStatus: 'failed',
      error: { code: 'NETWORK_ERROR', retryable: true }
    }]);
    const saved = queue.list()[0];
    const expectedDelay = Math.min(5 * 60 * 1000, 1000 * (2 ** Math.min(attempt - 1, 8)));
    assert.equal(saved.attemptCount, attempt);
    assert.equal(saved.nextAttemptAt, now + expectedDelay);
    assert.equal(queue.pendingForSync().length, 0);
    now = saved.nextAttemptAt;
    assert.equal(queue.pendingForSync()[0].eventId, event.eventId);
  }
});

test('duplicate or malformed acknowledgement IDs are rejected before queue mutation', () => {
  const queue = new EventQueue({ accountId: 'ack-user', storage: makeStorage(), createId: makeIds() });
  const event = queue.enqueue({
    type: 'action',
    payload: { action: 'remember', wordId: 'ack-word' }
  });

  assert.throws(() => queue.reconcile([
    { eventId: event.eventId, syncStatus: 'confirmed', serverSequence: 1 },
    { eventId: event.eventId, syncStatus: 'confirmed', serverSequence: 1 }
  ]), /EVENT_SYNC_RESPONSE_INVALID/);
  assert.throws(() => queue.reconcile([{ eventId: '', syncStatus: 'confirmed', serverSequence: 1 }]), /EVENT_SYNC_RESPONSE_INVALID/);
  assert.equal(queue.list()[0].syncStatus, 'pending');
  assert.equal(queue.list()[0].serverSequence, null);
});
