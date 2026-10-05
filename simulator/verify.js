import assert from 'node:assert/strict';
import { runPath } from './index.js';
import { positiveBaseline, reverseBaseline } from './scenarios.js';
import { MasteryCalculator } from './MasteryCalculator.js';
import { DimensionUpdater } from './DimensionUpdater.js';
import { EventProcessor } from './EventProcessor.js';
import { StabilityEngine } from './StabilityEngine.js';

function close(actual, expected, label, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    label + ': ' + actual + ' !== ' + expected
  );
}

function assertState(result, expectedState, label) {
  assert.equal(result.state, expectedState, label);
  assert.notEqual(result.state, '穩固', label + ': must not be 穩固');
}

// Model C negative constraint: keep this test purely mathematical.
// It intentionally does not invoke selector, EventProcessor, or Scheduler.
const masteryCalculator = new MasteryCalculator();
const cappedScores = { meaning: 100, spelling: 100, listening: 50, usage: 100 };
const cappedMastery = masteryCalculator.calculate(cappedScores);

close(cappedMastery.overall, 80, 'Model C capped overall');
assertState(cappedMastery, '掌握', 'Model C capped state');

// Positive baseline verifies the frozen selector/event pipeline.
const positive = runPath(positiveBaseline).rows;
const expectedPositive = [
  [1, 0.6, 2.38, '初識', 1],
  [2, 0.7, 7.15, '初識', 1],
  [6, 0.8, 17.33, '初識', 1],
  [15, 0.9, 32, '模糊', 4],
  [35, 0.9, 37, '模糊', 4],
];
assert.equal(positive.length, expectedPositive.length);
expectedPositive.forEach(([day, stability, overall, state, interval], i) => {
  const row = positive[i];
  assert.equal(row.day, day);
  close(row.stabilityAfter, stability, 'positive stability');
  close(row.mastery.overall, overall, 'positive overall');
  assert.equal(row.mastery.state, state);
  assert.equal(row.schedule.interval, interval);
});

// Test-only control experiment:
// keep the selector active, but clamp listening after every event.
// This does not modify any production module or selector implementation.
// The selector's internal score snapshot is synchronized only in this test.
function syncSelectorTestScores(selector, scores) {
  // TEST-ONLY: 同步 selector 的內部快照。
  // production 路徑永遠由 EventProcessor.record() 更新。
  selector.scores = { ...scores };
}

function runMissingListeningControl({ days = 175 } = {}) {
  const dimensionUpdater = new DimensionUpdater();
  const stabilityEngine = new StabilityEngine();
  const processor = new EventProcessor({
    dimensionUpdater,
    stabilityEngine,
    eventMultiplier: 1.0,
  });

  const selector = processor.selectorFor('missing-listening-control');
  let scores = { meaning: 0, spelling: 0, listening: 0, usage: 0 };
  const rows = [];

  for (let day = 1; day <= days; day += 1) {
    const selected = selector.select(day);

    const result = processor.process({
      wordId: 'missing-listening-control',
      day,
      verification: selected.verification,
      result: 'correct',
      hintLevel: 'none',
      scores,
    });

    scores = result.scores;

    // TEST-ONLY control: listening is intentionally held at 50.
    scores = { ...scores, listening: 50 };
    syncSelectorTestScores(selector, scores);
    assert.equal(result.event.verification, selected.verification);

    const mastery = masteryCalculator.calculate(scores);
    rows.push({
      day,
      verification: selected.verification,
      scores: { ...scores },
      mastery,
    });

    assert.notEqual(mastery.state, '穩固', 'missing-listening control state');
  }

  return { rows, scores, selector };
}

const missing = runMissingListeningControl();
assert.equal(missing.scores.listening, 50);
assert.equal(missing.rows.at(-1).mastery.overall, 80);
assert.equal(missing.rows.every((row) => row.mastery.state !== '穩固'), true);

// Reverse/error baseline remains an event-level regression test.
const reverse = runPath(reverseBaseline).rows;
const expectedReverse = [
  [1, 83, 87.2, '穩固', 0.8, 39],
  [2, 83, 85.8, '穩固', 0.7, 36],
  [3, 83, 81.8, '掌握', 0.6, 15],
  [3, 83, 80.2, '掌握', 0.5, 14],
  [3, 76, 78.6, '掌握', 0.4, 13],
  [5, 68, 75.4, '掌握', 0.3, 11],
  [5, 68, 73.8, '掌握', 0.2, 10],
  [8, 61, 71, '掌握', 0.1, 8],
];
assert.equal(reverse.length, expectedReverse.length);
expectedReverse.forEach(([day, spelling, overall, state, stability, interval], i) => {
  const row = reverse[i];
  assert.equal(row.day, day);
  assert.equal(row.scores.meaning, spelling);
  close(row.mastery.overall, overall, 'reverse overall');
  assert.equal(row.mastery.state, state);
  close(row.stabilityAfter, stability, 'reverse stability');
  assert.equal(row.schedule.interval, interval);
});

// eventMultiplier must affect recovery evidence only, not mastery dimensions.
const off = runPath({ ...positiveBaseline, eventMultiplier: 1 }).rows;
const on = runPath({ ...positiveBaseline, eventMultiplier: 1.2 }).rows;
assert.equal(off[1].scores.spelling, on[1].scores.spelling);
assert.notEqual(off[1].progressAfter, on[1].progressAfter);

console.log('SIMULATOR_VERIFY_OK');
console.log('MODEL_C_STATIC_CONTROL_OK', {
  scores: cappedScores,
  overall: cappedMastery.overall,
  state: cappedMastery.state,
});
console.log('MISSING_LISTENING_CONTROL_OK', {
  days: missing.rows.length,
  listening: missing.scores.listening,
  overall: missing.rows.at(-1).mastery.overall,
  state: missing.rows.at(-1).mastery.state,
});
console.table(
  positive.map((r) => ({
    day: r.day,
    event: r.event,
    stability: r.stabilityAfter,
    progress: r.progressAfter,
    evidence: r.evidence,
    overall: Number(r.mastery.overall.toFixed(2)),
    state: r.mastery.state,
    M: r.scores.meaning,
    S: r.scores.spelling,
    L: r.scores.listening,
    U: r.scores.usage,
    interval: r.schedule.interval,
    nextReview: r.schedule.nextReviewDay,
  }))
);
