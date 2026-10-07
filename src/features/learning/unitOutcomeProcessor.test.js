import assert from 'node:assert/strict';
import { processUnitOutcome } from './unitOutcomeProcessor.js';

const baseState = {
  scores: {
    meaning: 0,
    spelling: 0,
    listening: 0,
    usage: 0,
  },
  stability: {
    stability: 0.5,
    progress: 0,
    requiredRecovery: 2,
  },
  lastResult: null,
};

const correct = processUnitOutcome({
  unitOutcome: {
    result: 'correct',
    actionSummary: {
      actions: [
        { verification: 'choice', result: 'correct' },
        { verification: 'spelling', result: 'correct' },
        { verification: 'dictation', result: 'correct' },
      ],
    },
  },
  currentState: baseState,
});

assert.deepEqual(correct.scores, {
  meaning: 25,
  spelling: 55,
  listening: 25,
  usage: 0,
});
assert.equal(correct.stability.stability, 0.6);
assert.equal(correct.stability.progress, 1);
assert.equal(correct.stability.transitions, 1);
assert.equal(correct.lastResult, 'correct');
assert.equal(correct.errorEpisode, null);
assert.equal(correct.actionChanges.length, 3);

const wrong = processUnitOutcome({
  unitOutcome: {
    result: 'wrong',
    actionSummary: {
      actions: [
        { verification: 'choice', result: 'wrong' },
        { verification: 'dictation', result: 'wrong' },
      ],
    },
  },
  currentState: {
    scores: {
      meaning: 50,
      spelling: 50,
      listening: 50,
      usage: 50,
    },
    stability: {
      stability: 0.8,
      progress: 4,
      requiredRecovery: 8,
    },
    lastResult: 'correct',
  },
});

assert.deepEqual(wrong.scores, {
  meaning: 45,
  spelling: 45,
  listening: 45,
  usage: 50,
});
assert.equal(wrong.stability.stability, 0.7);
assert.equal(wrong.stability.progress, 0);
assert.equal(wrong.stability.transitions, -1);
assert.deepEqual(wrong.errorEpisode, {
  count: 1,
  dimensions: ['listening', 'meaning', 'spelling'],
  stabilityAtStart: 0.8,
});
assert.equal(wrong.lastResult, 'wrong');

assert.throws(
  () => processUnitOutcome({
    unitOutcome: {
      result: 'weak',
      actionSummary: {
        actions: [{ verification: 'choice', result: 'wrong' }],
      },
    },
    currentState: baseState,
  }),
  /weak 暂未定义/
);

console.log('correct: PASS');
console.log('wrong: PASS');
console.log('weak: PASS');
console.log('TOTAL: 3 / 3');
