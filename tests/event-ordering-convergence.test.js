import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRemoteLearningEvent,
  getWordLearningState
} from '../src/features/learning/learningState.js';

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function withAccountStorage(callback) {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: makeStorage() };
  try {
    return callback();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

const events = [
  {
    eventId: 'b6d2cfa9-67a7-4e4b-9b0e-000000000401',
    type: 'action',
    serverSequence: 1,
    payload: {
      wordId: 'convergence-word',
      day: 20637,
      verification: 'choice',
      result: 'wrong',
      hintLevel: 'none'
    }
  },
  {
    eventId: 'b6d2cfa9-67a7-4e4b-9b0e-000000000402',
    type: 'action',
    serverSequence: 2,
    payload: {
      wordId: 'convergence-word',
      day: 20637,
      verification: 'spelling',
      result: 'correct',
      hintLevel: 'none'
    }
  },
  {
    eventId: 'b6d2cfa9-67a7-4e4b-9b0e-000000000403',
    type: 'action',
    serverSequence: 3,
    payload: {
      wordId: 'convergence-word',
      day: 20638,
      verification: 'usage',
      result: 'correct',
      hintLevel: 'none'
    }
  }
];

test('learning state converges when the same server events arrive in different orders', () => {
  const forward = withAccountStorage(() => {
    for (const event of events) applyRemoteLearningEvent(event, 'device-forward');
    return getWordLearningState('convergence-word', 'device-forward');
  });

  const reverse = withAccountStorage(() => {
    for (const event of [...events].reverse()) applyRemoteLearningEvent(event, 'device-reverse');
    return getWordLearningState('convergence-word', 'device-reverse');
  });

  assert.deepEqual(reverse.scores, forward.scores);
  assert.equal(reverse.mastery, forward.mastery);
  assert.deepEqual(reverse.stability, forward.stability);
  assert.equal(reverse.reviewCount, forward.reviewCount);
  assert.equal(reverse.lastEvent?.verification, forward.lastEvent?.verification);
  assert.equal(reverse.nextReviewDay, forward.nextReviewDay);
});
