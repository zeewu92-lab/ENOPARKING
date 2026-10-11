import test from 'node:test';
import assert from 'node:assert/strict';
import { replayNativeWordLearning } from '../apps/mobile/src/learning/NativeLearningAlgorithm.js';

test('native algorithm returns the first scheduled verification for an unseen word', () => {
  const state = replayNativeWordLearning([], 'word-1', 20637);
  assert.equal(state.reviewCount, 0);
  assert.equal(state.nextVerification, 'choice');
  assert.equal(state.selectedDimension, 'meaning');
  assert.equal(state.mastery.state, '未學');
  assert.equal(state.nextReviewDay, 20637);
});

test('native algorithm replays correct and wrong answers into mastery dimensions', () => {
  const state = replayNativeWordLearning([
    {
      eventId: 'event-1',
      localCounter: 1,
      type: 'action',
      payload: {
        wordId: 'WORD-1',
        day: 20637,
        verification: 'choice',
        result: 'correct',
        hintLevel: 'none',
      },
    },
    {
      eventId: 'event-2',
      localCounter: 2,
      type: 'action',
      payload: {
        wordId: 'word-1',
        day: 20638,
        verification: 'spelling',
        result: 'wrong',
        hintLevel: 'none',
      },
    },
    {
      eventId: 'other-word',
      localCounter: 3,
      type: 'action',
      payload: {
        wordId: 'word-2',
        day: 20638,
        verification: 'choice',
        result: 'correct',
        hintLevel: 'none',
      },
    },
  ], 'word-1', 20639);

  assert.equal(state.wordId, 'word-1');
  assert.equal(state.reviewCount, 2);
  assert.equal(state.nextVerification, 'dictation');
  assert.equal(state.scores.meaning > 0, true);
  assert.equal(state.scores.spelling, 0);
  assert.equal(state.lastEvent.result, 'wrong');
  assert.equal(state.nextReviewDay, 20639);
});

test('native algorithm orders confirmed same-day events by server sequence', () => {
  const state = replayNativeWordLearning([
    {
      eventId: 'server-2',
      localCounter: 2,
      serverSequence: 12,
      type: 'action',
      payload: { wordId: 'word-1', day: 20637, verification: 'spelling', result: 'wrong', hintLevel: 'none' },
    },
    {
      eventId: 'server-1',
      localCounter: 1,
      serverSequence: 11,
      type: 'action',
      payload: { wordId: 'word-1', day: 20637, verification: 'choice', result: 'correct', hintLevel: 'none' },
    },
  ], 'word-1', 20638);

  assert.equal(state.reviewCount, 2);
  assert.equal(state.nextVerification, 'dictation');
  assert.equal(state.lastEvent.result, 'wrong');
});

test('native algorithm rejects malformed historical events instead of returning partial state', () => {
  assert.throws(() => replayNativeWordLearning([
    {
      type: 'action',
      payload: { wordId: 'word-1', day: -1, verification: 'choice', result: 'correct' },
    },
  ], 'word-1', 20638), /NATIVE_LEARNING_HISTORY_CORRUPT/);
});
