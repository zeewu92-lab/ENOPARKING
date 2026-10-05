import { DailyBatch } from './DailyBatch.js';
import { DimensionUpdater } from './DimensionUpdater.js';
import { EventProcessor } from './EventProcessor.js';
import { MasteryCalculator } from './MasteryCalculator.js';
import { Scheduler } from './Scheduler.js';
import { StabilityEngine } from './StabilityEngine.js';

const WORD_COUNT = 900;
const DAYS = 365;
const CONFIG = { newTarget: 5, reviewCap: 20, dailyMax: 30, eventMultiplier: 1.0 };
const ERROR_RATES = [0, 5, 10, 15, 20, 30];
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

function percentile(values, rate) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * rate) - 1));
  return sorted[index];
}

function createWord(wordId) {
  const stabilityEngine = new StabilityEngine({ initialStability: 0.5, initialProgress: 0 });
  return {
    wordId, isNew: true, nextReviewAt: null, scores: { ...INITIAL_SCORES }, stabilityEngine,
    processor: new EventProcessor({ dimensionUpdater: new DimensionUpdater(), stabilityEngine, eventMultiplier: CONFIG.eventMultiplier }),
    reviewCount: 0, eventCount: 0, errorCount: 0, weakEventCount: 0, firstReviewReceived: false,
    lastSeenAt: 0, overdueDays: 0, errorStreakWindow: 0, lowestDimension: 0,
  };
}

function updateBatchFields(word, day) {
  word.overdueDays = word.nextReviewAt == null ? 0 : Math.max(0, day - word.nextReviewAt);
  word.lowestDimension = Math.min(word.scores.meaning, word.scores.spelling, word.scores.listening, word.scores.usage);
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
    wordId: word.wordId, day, verification: selected.verification,
    result: isError ? 'incorrect' : 'correct', hintLevel: 'none', scores: word.scores,
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
    // 第一次事件完成後按初識間隔進入複習池。
    scheduleWord(word, '初識', word.stabilityEngine.stability, day);
    word.isNew = false;
    return;
  }

  if (result.kind === 'correct') {
    const mastery = masteryCalculator.calculate(word.scores);
    scheduleWord(word, mastery.state, result.recovery.after.stability, day);
  }
}

function runScenario(errorRate) {
  const words = Array.from({ length: WORD_COUNT }, (_, index) => createWord('w' + (index + 1)));
  const batch = new DailyBatch({ newTarget: CONFIG.newTarget, reviewCap: CONFIG.reviewCap, dailyMax: CONFIG.dailyMax });
  let totalEvents = 0;
  let totalErrors = 0;
  let totalWeakEvents = 0;

  for (let day = 1; day <= DAYS; day += 1) {
    for (const word of words) updateBatchFields(word, day);
    const selectedWords = batch.generate({ words, today: day });
    for (const word of selectedWords) {
      const errorsBefore = word.errorCount;
      const weakBefore = word.weakEventCount;
      processWord(word, day, errorRate);
      totalEvents += 1;
      totalErrors += word.errorCount - errorsBefore;
      totalWeakEvents += word.weakEventCount - weakBefore;
    }
  }

  // 只封閉測試窗口內最後仍開啟的 episode，不執行窗口外事件。
  for (const word of words) {
    const finalEpisode = word.stabilityEngine.endErrorEpisode();
    if (finalEpisode) closeEpisode(word, finalEpisode);
  }

  const reviewDistribution = {};
  const stabilityValues = [];
  let totalReviews = 0;
  let firstReviewCount = 0;
  let zeroReviewCount = 0;
  let masteryCount = 0;
  let stableCount = 0;
  let below25Count = 0;

  for (const word of words) {
    const mastery = masteryCalculator.calculate(word.scores);
    reviewDistribution[word.reviewCount] = (reviewDistribution[word.reviewCount] ?? 0) + 1;
    totalReviews += word.reviewCount;
    if (word.firstReviewReceived) firstReviewCount += 1;
    if (word.reviewCount === 0) zeroReviewCount += 1;
    if (mastery.state === '掌握') masteryCount += 1;
    if (mastery.state === '穩固') stableCount += 1;
    if (mastery.overall < 25) below25Count += 1;
    stabilityValues.push(word.stabilityEngine.stability);
  }

  const duePool = words.filter((word) => word.nextReviewAt != null && word.nextReviewAt <= DAYS).length;
  return {
    errorRate, totalEvents, totalErrors, totalWeakEvents,
    p0: { firstReviewCoverage: firstReviewCount / WORD_COUNT * 100, firstReviewCount },
    p1: {
      reviewDistribution, zeroReviewCount, zeroReviewRate: zeroReviewCount / WORD_COUNT * 100,
      averageReviews: totalReviews / WORD_COUNT, totalReviews,
    },
    p2: {
      masteryRate: masteryCount / WORD_COUNT * 100, stableRate: stableCount / WORD_COUNT * 100,
      below25Rate: below25Count / WORD_COUNT * 100,
      stabilityP50: percentile(stabilityValues, 0.5), stabilityP90: percentile(stabilityValues, 0.9),
      realizedErrorRate: totalEvents ? totalErrors / totalEvents * 100 : 0, weakEventCount: totalWeakEvents,
    },
    p3: { duePool },
  };
}

function printResult(result) {
  console.log('\n===== ERROR ' + result.errorRate + '% =====');
  console.log('\nP0 1st review 覆蓋率');
  console.log({ coverage: Number(result.p0.firstReviewCoverage.toFixed(2)), reviewedWords: result.p0.firstReviewCount, totalWords: WORD_COUNT });
  console.log('\nP1 reviewCount 分佈');
  console.table(Object.entries(result.p1.reviewDistribution).map(([reviewCount, wordCount]) => ({ reviewCount: Number(reviewCount), wordCount })).sort((a, b) => a.reviewCount - b.reviewCount));
  console.log({ zeroReviewCount: result.p1.zeroReviewCount, zeroReviewRate: Number(result.p1.zeroReviewRate.toFixed(2)), averageReviews: Number(result.p1.averageReviews.toFixed(2)), totalReviews: result.p1.totalReviews });
  console.log('\nP2 掌握 / 穩固 / <25');
  console.log({ mastery: Number(result.p2.masteryRate.toFixed(2)), stable: Number(result.p2.stableRate.toFixed(2)), below25: Number(result.p2.below25Rate.toFixed(2)), stabilityP50: result.p2.stabilityP50, stabilityP90: result.p2.stabilityP90, realizedErrorRate: Number(result.p2.realizedErrorRate.toFixed(2)), weakEventCount: result.p2.weakEventCount });
  console.log('\nP3 due pool');
  console.log({ duePool: result.p3.duePool });
}

console.log('========================================');
console.log('365-DAY LEARNING SIMULATOR');
console.log('========================================');
console.log({ words: WORD_COUNT, days: DAYS, ...CONFIG, hash: 'FNV-1a 32-bit', hashInput: 'wordId:day', errorRates: ERROR_RATES });

const results = ERROR_RATES.map(runScenario);
for (const result of results) printResult(result);

console.log('\n========================================');
console.log('P0 SUMMARY');
console.log('========================================');
console.table(results.map((result) => ({ errorRate: result.errorRate + '%', firstReviewCoverage: Number(result.p0.firstReviewCoverage.toFixed(2)) })));

console.log('\n========================================');
console.log('P1 SUMMARY');
console.log('========================================');
console.table(results.map((result) => ({ errorRate: result.errorRate + '%', zeroReviewRate: Number(result.p1.zeroReviewRate.toFixed(2)), averageReviews: Number(result.p1.averageReviews.toFixed(2)), totalReviews: result.p1.totalReviews })));

console.log('\n========================================');
console.log('P2 SUMMARY');
console.log('========================================');
console.table(results.map((result) => ({ errorRate: result.errorRate + '%', mastery: Number(result.p2.masteryRate.toFixed(2)), stable: Number(result.p2.stableRate.toFixed(2)), below25: Number(result.p2.below25Rate.toFixed(2)), stabilityP50: result.p2.stabilityP50, stabilityP90: result.p2.stabilityP90, realizedErrorRate: Number(result.p2.realizedErrorRate.toFixed(2)), weakEvents: result.p2.weakEventCount })));

console.log('\n========================================');
console.log('P3 SUMMARY');
console.log('========================================');
console.table(results.map((result) => ({ errorRate: result.errorRate + '%', duePool: result.p3.duePool })));