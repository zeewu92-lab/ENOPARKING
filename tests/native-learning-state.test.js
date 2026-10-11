import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyNativeLearningEvent,
  recordNativeLearningAction
} from '../apps/mobile/src/learning/NativeLearningState.js';

function makeTransaction() {
  const rows = new Map();
  return {
    rows,
    async getFirstAsync(_sql, accountId, stateKey) {
      const value = rows.get(accountId + ':' + stateKey);
      return value === undefined ? null : { stateJson: value };
    },
    async runAsync(_sql, accountId, stateKey, stateJson) {
      rows.set(accountId + ':' + stateKey, stateJson);
      return { changes: 1 };
    }
  };
}

const event = {
  eventId: 'native-event-1',
  type: 'action',
  payload: {
    wordId: 'Word-1',
    day: 20637,
    verification: 'choice',
    result: 'correct',
    hintLevel: 'none'
  },
  createdAt: 100
};

test('native learning projection records an action and updates account-scoped word state', async () => {
  const tx = makeTransaction();
  assert.equal(await applyNativeLearningEvent(tx, 'account-a', event, { now: 110 }), true);
  const word = JSON.parse(tx.rows.get('account-a:word:word-1'));
  const history = JSON.parse(tx.rows.get('account-a:event:native-event-1'));
  assert.deepEqual({
    reviewCount: word.reviewCount,
    correctCount: word.correctCount,
    wrongCount: word.wrongCount,
    lastDay: word.lastDay
  }, { reviewCount: 1, correctCount: 1, wrongCount: 0, lastDay: 20637 });
  assert.equal(history.eventId, event.eventId);
  assert.equal(tx.rows.has('account-b:word:word-1'), false);
});

test('native learning projection is idempotent for duplicate event IDs', async () => {
  const tx = makeTransaction();
  await applyNativeLearningEvent(tx, 'account-a', event, { now: 110 });
  assert.equal(await applyNativeLearningEvent(tx, 'account-a', event, { now: 120 }), false);
  const word = JSON.parse(tx.rows.get('account-a:word:word-1'));
  assert.equal(word.reviewCount, 1);
  assert.equal(word.correctCount, 1);
});

test('native learning projection tracks wrong answers and unit outcomes', async () => {
  const tx = makeTransaction();
  await applyNativeLearningEvent(tx, 'account-a', {
    ...event,
    eventId: 'native-event-2',
    payload: { ...event.payload, result: 'wrong' }
  }, { now: 110 });
  await applyNativeLearningEvent(tx, 'account-a', {
    eventId: 'unit-event-1',
    type: 'unit_outcome',
    payload: { unitId: 'unit-1', correct: false },
    createdAt: 120,
    serverSequence: 2
  }, { now: 120 });
  const word = JSON.parse(tx.rows.get('account-a:word:word-1'));
  const unit = JSON.parse(tx.rows.get('account-a:unit:unit-1'));
  assert.equal(word.wrongCount, 1);
  assert.equal(unit.outcomeCount, 1);
  assert.equal(unit.wrongCount, 1);
  assert.equal(unit.lastServerSequence, 2);
});

test('native learning recorder enqueues before atomically applying the optimistic projection', async () => {
  const tx = makeTransaction();
  let captured;
  const store = {
    async enqueue(accountId, queuedEvent, options) {
      captured = { accountId, queuedEvent };
      await options.applyOptimisticState(tx, queuedEvent);
      return queuedEvent;
    }
  };
  const queued = await recordNativeLearningAction({
    store,
    accountId: 'account-a',
    payload: event.payload,
    createEventId: () => 'native-event-3',
    now: 130
  });
  assert.equal(captured.accountId, 'account-a');
  assert.equal(queued.eventId, 'native-event-3');
  assert.equal(queued.payload.wordId, 'word-1');
  const word = JSON.parse(tx.rows.get('account-a:word:word-1'));
  assert.equal(word.reviewCount, 1);
  assert.equal(word.correctCount, 1);
});

test('native learning recorder rejects malformed payload before calling the store', async () => {
  let called = false;
  await assert.rejects(recordNativeLearningAction({
    store: { enqueue: async () => { called = true; } },
    accountId: 'account-a',
    payload: { ...event.payload, hintLevel: 'answer' },
    createEventId: () => 'native-event-4',
    now: 130
  }), /NATIVE_LEARNING_ACTION_INVALID/);
  assert.equal(called, false);
});
