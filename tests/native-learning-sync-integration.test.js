import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeEventStore } from '../apps/mobile/src/storage/NativeEventStore.js';
import { applyNativeLearningEvent } from '../apps/mobile/src/learning/NativeLearningState.js';

function makeTransactionalDb() {
  let committed = { meta: new Map(), events: new Map(), applied: new Map(), states: new Map() };
  const clone = value => structuredClone(value);
  return {
    snapshot: () => clone(committed),
    async withExclusiveTransactionAsync(operation) {
      const working = clone(committed);
      const tx = {
        async getFirstAsync(sql, ...params) {
          if (sql.includes('replay_cursor AS replayCursor')) {
            const meta = working.meta.get(params[0]);
            return meta ? { replayCursor: meta.replayCursor } : null;
          }
          if (sql.includes('next_local_counter')) {
            const meta = working.meta.get(params[0]);
            return meta ? { next_local_counter: meta.nextLocalCounter } : null;
          }
          if (sql.includes('server_sequence AS serverSequence FROM enop_applied_events')) {
            const marker = working.applied.get(params[0] + ':' + params[1]);
            return marker ? { serverSequence: marker.serverSequence } : null;
          }
          if (sql.includes('event_id AS eventId FROM enop_applied_events')) {
            const marker = [...working.applied.values()].find(item =>
              item.accountId === params[0] && item.serverSequence === params[1]);
            return marker ? { eventId: marker.eventId } : null;
          }
          if (sql.includes('state_json AS stateJson FROM enop_learning_state')) {
            const value = working.states.get(params[0] + ':' + params[1]);
            return value === undefined ? null : { stateJson: value };
          }
          return null;
        },
        async runAsync(sql, ...params) {
          if (sql.includes('INSERT INTO enop_event_store_meta')) {
            if (!working.meta.has(params[0])) working.meta.set(params[0], {
              accountId: params[0], nextLocalCounter: 1, replayCursor: 0, updatedAt: params[2]
            });
          } else if (sql.includes('INSERT INTO enop_applied_events')) {
            working.applied.set(params[0] + ':' + params[1], {
              accountId: params[0], eventId: params[1], serverSequence: params[2], appliedAt: params[3]
            });
          } else if (sql.includes('UPDATE enop_event_store_meta SET replay_cursor')) {
            const meta = working.meta.get(params[2]);
            meta.replayCursor = params[0];
            meta.updatedAt = params[1];
          } else if (sql.includes('INSERT INTO enop_learning_state')) {
            working.states.set(params[0] + ':' + params[1], params[2]);
          } else if (sql.includes('UPDATE enop_applied_events SET server_sequence')) {
            const marker = working.applied.get(params[1] + ':' + params[2]);
            marker.serverSequence = params[0];
          } else if (sql.includes('UPDATE enop_learning_events')) {
            // A remote event that is already locally queued is confirmed here.
            working.events.set(params[1] + ':' + params[2], { syncStatus: 'confirmed', serverSequence: params[0] });
          }
          return { changes: 1 };
        }
      };
      const result = await operation(tx);
      committed = working;
      return result;
    },
    async getFirstAsync(sql, ...params) {
      if (sql.includes('replay_cursor AS replayCursor')) {
        const meta = committed.meta.get(params[0]);
        return meta ? { replayCursor: meta.replayCursor } : null;
      }
      return null;
    },
    async getAllAsync() { return []; }
  };
}

const remoteEvent = {
  eventId: 'remote-event-0001',
  type: 'action',
  payload: {
    wordId: 'word-remote-1',
    day: 20637,
    verification: 'choice',
    result: 'correct',
    hintLevel: 'none'
  },
  createdAt: 100,
  serverSequence: 1
};

test('remote replay commits learning projection, applied marker, and cursor atomically', async () => {
  const db = makeTransactionalDb();
  const store = new NativeEventStore(db, { clock: () => 120 });
  const applyEvent = (tx, event) => applyNativeLearningEvent(tx, 'account-a', event, { now: 120 });

  const first = await store.applyReplay('account-a', [remoteEvent], applyEvent);
  assert.deepEqual(first, { appliedCount: 1 });
  const snapshot = db.snapshot();
  const word = JSON.parse(snapshot.states.get('account-a:word:word-remote-1'));
  assert.equal(word.reviewCount, 1);
  assert.equal(word.correctCount, 1);
  assert.equal(snapshot.applied.get('account-a:remote-event-0001').serverSequence, 1);
  assert.equal(snapshot.meta.get('account-a').replayCursor, 1);

  const duplicate = await store.applyReplay('account-a', [remoteEvent], applyEvent);
  assert.deepEqual(duplicate, { appliedCount: 0 });
  const afterDuplicate = db.snapshot();
  assert.equal(JSON.parse(afterDuplicate.states.get('account-a:word:word-remote-1')).reviewCount, 1);
  assert.equal(afterDuplicate.applied.size, 1);
  assert.equal(afterDuplicate.meta.get('account-a').replayCursor, 1);
});

test('remote replay rolls back projection and cursor when event application fails', async () => {
  const db = makeTransactionalDb();
  const store = new NativeEventStore(db, { clock: () => 120 });
  await assert.rejects(
    store.applyReplay('account-a', [remoteEvent], async (tx, event) => {
      await applyNativeLearningEvent(tx, 'account-a', event, { now: 120 });
      throw new Error('projection commit rejected');
    }),
    /projection commit rejected/
  );
  const snapshot = db.snapshot();
  assert.equal(snapshot.meta.size, 0);
  assert.equal(snapshot.states.size, 0);
  assert.equal(snapshot.applied.size, 0);
});

test('the same event identity is isolated across two accounts', async () => {
  const db = makeTransactionalDb();
  const store = new NativeEventStore(db, { clock: () => 120 });
  await store.applyReplay('account-a', [remoteEvent], (tx, event) =>
    applyNativeLearningEvent(tx, 'account-a', event, { now: 120 }));
  await store.applyReplay('account-b', [remoteEvent], (tx, event) =>
    applyNativeLearningEvent(tx, 'account-b', event, { now: 120 }));

  const snapshot = db.snapshot();
  const stateA = JSON.parse(snapshot.states.get('account-a:word:word-remote-1'));
  const stateB = JSON.parse(snapshot.states.get('account-b:word:word-remote-1'));
  assert.equal(stateA.reviewCount, 1);
  assert.equal(stateB.reviewCount, 1);
  assert.equal(snapshot.applied.has('account-a:remote-event-0001'), true);
  assert.equal(snapshot.applied.has('account-b:remote-event-0001'), true);
  assert.equal(snapshot.meta.get('account-a').replayCursor, 1);
  assert.equal(snapshot.meta.get('account-b').replayCursor, 1);
});
