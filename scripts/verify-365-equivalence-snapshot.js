import fs from 'fs';

import { DailyBatch } from '../simulator/DailyBatch.js';
import { DimensionUpdater } from '../simulator/DimensionUpdater.js';
import { EventProcessor } from '../simulator/EventProcessor.js';
import { MasteryCalculator } from '../simulator/MasteryCalculator.js';
import { Scheduler } from '../simulator/Scheduler.js';
import { StabilityEngine } from '../simulator/StabilityEngine.js';

const HARNESS_CONTRACT = Object.freeze({
  wordCount: 900,
  days: 365,
  newTarget: 5,
  reviewCap: 20,
  dailyMax: 30,
  eventMultiplier: 1.0,
  errorRates: [0, 5, 10, 15, 20, 30],
});

const WORD_COUNT = HARNESS_CONTRACT.wordCount;
const DAYS = HARNESS_CONTRACT.days;
const ERROR_RATES = HARNESS_CONTRACT.errorRates;
const CONFIG = {
  newTarget: HARNESS_CONTRACT.newTarget,
  reviewCap: HARNESS_CONTRACT.reviewCap,
  dailyMax: HARNESS_CONTRACT.dailyMax,
  eventMultiplier: HARNESS_CONTRACT.eventMultiplier,
};
const INITIAL_SCORES = { meaning: 0, spelling: 0, listening: 0, usage: 0 };

const masteryCalculator = new MasteryCalculator();
const scheduler = new Scheduler();

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash >>> 0;
}

function shouldInjectError(wordId, day, errorRate) {
  if (errorRate <= 0) return false;
  if (errorRate >= 100) return true;
  return fnv1a32(wordId + ':' + day) % 100 < errorRate;
}

function createWord(wordId) {
  const stabilityEngine = new StabilityEngine({
    initialStability: 0.5,
    initialProgress: 0,
  });
  return {
    wordId,
    isNew: true,
    nextReviewAt: null,
    scores: { ...INITIAL_SCORES },
    stabilityEngine,
    processor: new EventProcessor({
      dimensionUpdater: new DimensionUpdater(),
      stabilityEngine,
      eventMultiplier: CONFIG.eventMultiplier,
    }),
    reviewCount: 0,
    eventCount: 0,
    errorCount: 0,
    weakEventCount: 0,
    firstReviewReceived: false,
    lastSeenAt: 0,
    overdueDays: 0,
    errorStreakWindow: 0,
    lowestDimension: 0,
  };
}

function snapshotWord(word) {
  return {
    wordId: word.wordId,
    isNew: word.isNew,
    nextReviewAt: word.nextReviewAt ?? null,
    scores: {
      meaning: word.scores.meaning,
      spelling: word.scores.spelling,
      listening: word.scores.listening,
      usage: word.scores.usage,
    },
    reviewCount: word.reviewCount,
    eventCount: word.eventCount,
    errorCount: word.errorCount,
    weakEventCount: word.weakEventCount,
    firstReviewReceived: word.firstReviewReceived,
    lastSeenAt: word.lastSeenAt,
    overdueDays: word.overdueDays,
    errorStreakWindow: word.errorStreakWindow,
    lowestDimension: word.lowestDimension,
    stability: word.stabilityEngine.stability,
  };
}

function scheduleWord(word, state, stability, day) {
  const schedule = scheduler.schedule({ state, stability, reviewedAtDay: day });
  word.nextReviewAt = schedule.nextReviewDay;
  return schedule;
}

function closeEpisode(word, episode) {
  const scores = episode.closedEpisodeScores ?? word.scores;
  const mastery = masteryCalculator.calculate(scores);
  scheduleWord(word, mastery.state, episode.newStability, episode.day);
}

function processWord(word, day, errorRate) {
  const selector = word.processor.selectorFor(word.wordId);
  const selected = selector.select(day);
  const isFirstEvent = selector.reviewCount === 0;
  const isError = shouldInjectError(word.wordId, day, errorRate);
  const result = word.processor.process({
    wordId: word.wordId,
    day,
    verification: selected.verification,
    result: isError ? 'incorrect' : 'correct',
    hintLevel: 'none',
    scores: word.scores,
  });

  word.scores = result.scores;
  word.eventCount += 1;
  word.lastSeenAt = day;

  if (isError) {
    word.errorCount += 1;
    if (result.event.errorStrength === 'weak') word.weakEventCount += 1;
    word.errorStreakWindow += 1;
  } else {
    word.errorStreakWindow = 0;
  }

  if (!isFirstEvent) {
    word.reviewCount += 1;
    word.firstReviewReceived = true;
  }

  if (result.closedEpisode) {
    closeEpisode(word, {
      ...result.closedEpisode,
      closedEpisodeScores: result.closedEpisodeScores,
    });
  }

  if (isFirstEvent) {
    scheduleWord(word, '初識', word.stabilityEngine.stability, day);
    word.isNew = false;
    return;
  }

  if (result.kind === 'correct') {
    const mastery = masteryCalculator.calculate(word.scores);
    scheduleWord(word, mastery.state, result.recovery.after.stability, day);
  }
}

function runScenarioWithSnapshots(errorRate) {
  const words = Array.from({ length: WORD_COUNT }, (_, index) => createWord('w' + (index + 1)));
  const batch = new DailyBatch({
    newTarget: CONFIG.newTarget,
    reviewCap: CONFIG.reviewCap,
    dailyMax: CONFIG.dailyMax,
  });
  const snapshots = [];

  for (let day = 1; day <= DAYS; day += 1) {
    const selectedWords = batch.generate({ words, today: day });
    for (const word of selectedWords) processWord(word, day, errorRate);

    const dailyWords = {};
    for (const word of words) dailyWords[word.wordId] = snapshotWord(word);
    snapshots.push({ day, words: dailyWords });
  }
  return snapshots;
}

const outputFile = process.argv[2] || 'snapshots.json';
const result = {};
for (const rate of ERROR_RATES) {
  console.log(`▶ 跑 error rate = ${rate}%`);
  result[String(rate)] = runScenarioWithSnapshots(rate);
}
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
console.log(`\n✅ 已輸出至 ${outputFile}`);
console.log(`   ${ERROR_RATES.length} 個 error rate × ${DAYS} 天 × ${WORD_COUNT} words`);
