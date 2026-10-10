import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRemoteLearningEvent,
  clearLearningEventsForTest,
  getLearningEvents,
  getNextVerification,
  getWordLearningState,
  recordLearningEvent,
  setLearningEventServerSequence
} from '../src/features/learning/learningState.js';

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('account-scoped learning history does not read or overwrite legacy or other account history', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: makeStorage() };
  try {
    const day = 20637;
    const selectedA = getNextVerification('word-1', day, 'user-a').verification;
    recordLearningEvent({
      accountId: 'user-a',
      wordId: 'word-1',
      day,
      verification: selectedA,
      result: 'correct'
    });

    assert.equal(getLearningEvents('user-a').length, 1);
    assert.equal(getLearningEvents('user-b').length, 0);
    assert.equal(getLearningEvents().length, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('remote learning actions are idempotent and use server sequence ordering', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: makeStorage() };
  try {
    const day = 20637;
    const expected = getNextVerification('word-1', day, 'user-a').verification;
    const remoteVerification = ['choice', 'spelling', 'dictation', 'usage'].find(value => value !== expected);
    const remote = {
      eventId: 'b6d2cfa9-67a7-4e4b-9b0e-2ec1d4a63b28',
      type: 'action',
      serverSequence: 7,
      payload: {
        wordId: 'Word-1',
        day,
        verification: remoteVerification,
        result: 'correct',
        hintLevel: 'none'
      }
    };

    assert.equal(applyRemoteLearningEvent(remote, 'user-a'), true);
    assert.equal(applyRemoteLearningEvent(remote, 'user-a'), false);
    assert.equal(getLearningEvents('user-a').length, 1);
    assert.equal(getLearningEvents('user-a')[0].serverSequence, 7);
    assert.equal(getLearningEvents('user-a')[0].wordId, 'word-1');
    assert.equal(getLearningEvents('user-b').length, 0);
    assert.doesNotThrow(() => getWordLearningState('word-1', 'user-a'));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('local event server sequence can be reconciled after sync acknowledgement', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: makeStorage() };
  try {
    const day = 20637;
    const eventId = 'b6d2cfa9-67a7-4e4b-9b0e-2ec1d4a63b28';
    const verification = getNextVerification('word-2', day, 'user-a').verification;
    recordLearningEvent({
      accountId: 'user-a',
      syncEventId: eventId,
      wordId: 'word-2',
      day,
      verification,
      result: 'wrong'
    });

    assert.equal(setLearningEventServerSequence('user-a', eventId, 12), true);
    assert.equal(setLearningEventServerSequence('user-a', eventId, 12), false);
    assert.equal(getLearningEvents('user-a')[0].serverSequence, 12);
    assert.equal(setLearningEventServerSequence('user-b', eventId, 13), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('remote event schema rejects malformed payload and missing account identity', () => {
  assert.throws(() => applyRemoteLearningEvent({ type: 'action', eventId: 'remote', serverSequence: 1, payload: {} }, 'user-a'), /EVENT_PAYLOAD_INVALID/);
  assert.throws(() => applyRemoteLearningEvent({ type: 'action', eventId: 'remote', serverSequence: 1, payload: {} }, ''), /LEARNING_EVENT_ACCOUNT_REQUIRED/);
});

test('remote unit outcomes are persisted and do not block replay consumers', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: makeStorage() };
  try {
    assert.equal(applyRemoteLearningEvent({
      eventId: 'b6d2cfa9-67a7-4e4b-9b0e-2ec1d4a63b29',
      type: 'unit_outcome',
      serverSequence: 8,
      payload: { unitId: 'unit-1', correct: true }
    }, 'user-a'), true);
    assert.equal(getLearningEvents('user-a')[0].type, 'unit_outcome');
    assert.equal(getLearningEvents('user-a')[0].correct, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
