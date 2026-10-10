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

function makeId() {
  return 'b6d2cfa9-67a7-4e4b-9b0e-000000000301';
}

function emptyPull({ afterSequence }) {
  return { events: [], nextSequence: afterSequence, hasMore: false };
}

test('lost acknowledgement retries the same event ID and server idempotency prevents duplicate writes', async () => {
  const storage = makeStorage();
  const queue = new EventQueue({ accountId: 'user-a', storage, createId: makeId });
  const queued = queue.enqueue({
    type: 'action',
    payload: { action: 'remember', wordId: 'word-1' },
    createdAt: 100
  });

  const serverEvents = new Map();
  let pushCalls = 0;
  const push = async ({ events }) => {
    pushCalls += 1;
    const results = events.map(event => {
      if (!serverEvents.has(event.eventId)) {
        serverEvents.set(event.eventId, {
          eventId: event.eventId,
          type: event.type,
          payload: event.payload,
          serverSequence: serverEvents.size + 1
        });
      }
      const saved = serverEvents.get(event.eventId);
      return { eventId: event.eventId, syncStatus: 'confirmed', serverSequence: saved.serverSequence };
    });

    // Simulate the server committing successfully while the response is lost.
    if (pushCalls === 1) throw new Error('NETWORK_RESPONSE_LOST');
    return { results };
  };

  await assert.rejects(() => replayEvents({
    queue,
    clientVersion: '1.0.0',
    push,
    pull: emptyPull,
    applyEvent: async () => {}
  }), /NETWORK_RESPONSE_LOST/);

  assert.equal(serverEvents.size, 1);
  assert.equal(queue.list()[0].syncStatus, 'pending');
  assert.equal(queue.list()[0].eventId, queued.eventId);

  const report = await replayEvents({
    queue,
    clientVersion: '1.0.0',
    push,
    pull: async ({ afterSequence }) => ({
      events: [],
      nextSequence: afterSequence,
      hasMore: false
    }),
    applyEvent: async () => {}
  });

  assert.equal(pushCalls, 2);
  assert.equal(serverEvents.size, 1);
  assert.equal(queue.list()[0].syncStatus, 'confirmed');
  assert.equal(queue.list()[0].serverSequence, 1);
  assert.equal(report.confirmed, 1);
});

test('pending queue survives a new queue instance after reload or re-login', async () => {
  const storage = makeStorage();
  const firstSession = new EventQueue({ accountId: 'user-a', storage, createId: makeId });
  const original = firstSession.enqueue({
    type: 'action',
    payload: { action: 'remember', wordId: 'word-recovered' },
    createdAt: 200
  });

  const nextSession = new EventQueue({ accountId: 'user-a', storage, createId: makeId });
  assert.deepEqual(nextSession.pendingForSync().map(event => event.eventId), [original.eventId]);

  let received;
  const report = await replayEvents({
    queue: nextSession,
    clientVersion: '1.0.0',
    push: async ({ events }) => {
      received = events;
      return {
        results: events.map(event => ({
          eventId: event.eventId,
          syncStatus: 'confirmed',
          serverSequence: 8
        }))
      };
    },
    pull: emptyPull,
    applyEvent: async () => {}
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].eventId, original.eventId);
  assert.equal(report.confirmed, 1);
  assert.equal(new EventQueue({ accountId: 'user-a', storage }).list()[0].syncStatus, 'confirmed');
});

test('re-login under a different account cannot push another account pending events', async () => {
  const storage = makeStorage();
  const userA = new EventQueue({ accountId: 'user-a', storage, createId: makeId });
  const userB = new EventQueue({ accountId: 'user-b', storage, createId: makeId });
  userA.enqueue({
    type: 'action',
    payload: { action: 'remember', wordId: 'private-a' },
    createdAt: 300
  });

  let pushCalls = 0;
  await replayEvents({
    queue: userB,
    clientVersion: '1.0.0',
    push: async () => {
      pushCalls += 1;
      return { results: [] };
    },
    pull: emptyPull,
    applyEvent: async () => {}
  });

  assert.equal(pushCalls, 0);
  assert.equal(userA.list().length, 1);
  assert.equal(userB.list().length, 0);
});
