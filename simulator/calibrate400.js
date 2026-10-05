import { createSimulator, DailyBatch } from './index.js';
import { DIMENSIONS } from './constants.js';

const DAYS = 40;
const WORDS = 400;
const REVIEW_CAP = 20;
const NEW_TARGET = 10;
const DAILY_MAX = 30;

function lowestDimension(scores) {
  return Math.min(...DIMENSIONS.map((dimension) => scores[dimension]));
}

function selectorDecision(selector, day) {
  const reviewCount = selector.reviewCount;
  const selected = selector.select(day);

  if (reviewCount < 4) {
    return {
      reviewCount,
      selectedDimension: selected.selectedDimension,
      verification: selected.verification,
      candidates: null,
      lowest: null,
      tied: [],
    };
  }

  const candidates = DIMENSIONS.filter((dimension) => selector.cooldownExpiry[dimension] <= day);
  const lowest = candidates.length
    ? Math.min(...candidates.map((dimension) => selector.scores[dimension]))
    : null;
  const tied = candidates.filter((dimension) => selector.scores[dimension] === lowest);

  return {
    reviewCount,
    scores: { ...selector.scores },
    cooldownExpiry: { ...selector.cooldownExpiry },
    lastVerifiedAt: { ...selector.lastVerifiedAt },
    candidates,
    lowest,
    tied,
    selectedDimension: selected.selectedDimension,
    verification: selected.verification,
  };
}

const words = Array.from({ length: WORDS }, (_, index) => ({
  wordId: 'w' + String(index + 1).padStart(3, '0'),
  scores: { meaning: 0, spelling: 0, listening: 0, usage: 0 },
  nextReviewAt: null,
  isNew: true,
  overdueDays: 0,
  errorStreakWindow: 0,
  lowestDimension: 0,
  lastSeenAt: 0,
  sim: createSimulator({
    eventMultiplier: 1.0,
    reviewCap: REVIEW_CAP,
    newTarget: NEW_TARGET,
    dailyMax: DAILY_MAX,
  }),
}));

const batcher = new DailyBatch({
  reviewCap: REVIEW_CAP,
  newTarget: NEW_TARGET,
  dailyMax: DAILY_MAX,
});

const counts = {
  total: 0,
  choice: 0,
  spelling: 0,
  dictation: 0,
  usage: 0,
};

const reviewCountBuckets = new Map();
const fourthPlus = [];
const firstFour = [];

for (let day = 1; day <= DAYS; day += 1) {
  for (const word of words) {
    word.overdueDays = word.nextReviewAt == null ? 0 : Math.max(0, day - word.nextReviewAt);
    word.lowestDimension = lowestDimension(word.scores);
  }

  const batch = batcher.generate({ words, today: day });

  for (const word of batch) {
    const selector = word.sim.processor.selectorFor(word.wordId);
    const decision = selectorDecision(selector, day);
    const reviewCountBefore = selector.reviewCount;

    const result = word.sim.processor.process({
      wordId: word.wordId,
      day,
      verification: decision.verification,
      result: 'correct',
      scores: word.scores,
    });

    word.scores = result.scores;
    word.lastSeenAt = day;
    word.isNew = false;

    const mastery = word.sim.masteryCalculator.calculate(word.scores);
    const schedule = word.sim.scheduler.schedule({
      state: mastery.state,
      stability: result.recovery.after.stability,
      reviewedAtDay: day,
    });
    word.nextReviewAt = schedule.nextReviewDay;
    word.lowestDimension = mastery.lowest;

    counts.total += 1;
    counts[result.event.verification] += 1;
    reviewCountBuckets.set(
      reviewCountBefore,
      (reviewCountBuckets.get(reviewCountBefore) ?? 0) + 1
    );

    if (reviewCountBefore >= 4) {
      fourthPlus.push({
        wordId: word.wordId,
        day,
        reviewCount: reviewCountBefore,
        scores: decision.scores,
        cooldownExpiry: decision.cooldownExpiry,
        lastVerifiedAt: decision.lastVerifiedAt,
        candidates: decision.candidates,
        lowest: decision.lowest,
        tied: decision.tied,
        selectedDimension: decision.selectedDimension,
        verification: decision.verification,
      });
    } else {
      firstFour.push({
        reviewCount: reviewCountBefore,
        verification: decision.verification,
      });
    }
  }
}

const fourthPlusCounts = Object.fromEntries(
  DIMENSIONS.map((dimension) => [
    dimension,
    fourthPlus.filter((row) => row.selectedDimension === dimension).length,
  ])
);

const tieRows = fourthPlus.filter((row) => row.tied.length > 1);
const tieCounts = {
  total: tieRows.length,
  listening: tieRows.filter((row) => row.selectedDimension === 'listening').length,
  spelling: tieRows.filter((row) => row.selectedDimension === 'spelling').length,
};

const fixedReviewCounts = Object.fromEntries(
  [1, 2, 3].map((count) => [
    count,
    firstFour.filter((row) => row.reviewCount === count).length,
  ])
);

console.log('CALIBRATE_400_OK');
console.log(JSON.stringify({
  days: DAYS,
  words: WORDS,
  total: counts.total,
  verification: {
    choice: counts.choice,
    spelling: counts.spelling,
    dictation: counts.dictation,
    usage: counts.usage,
  },
  fixedReviewCounts,
  fourthPlusCounts,
  fourthPlusTotal: fourthPlus.length,
  tieCounts,
  reviewCountBuckets: Object.fromEntries([...reviewCountBuckets.entries()].sort((a, b) => a[0] - b[0])),
}, null, 2));

console.log('FOURTH_PLUS_DECISIONS');
for (const row of fourthPlus) {
  console.log(JSON.stringify(row));
}
