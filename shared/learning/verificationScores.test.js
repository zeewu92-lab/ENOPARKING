/**
 * verificationScores 对照测试
 *
 * 验证重构后的 DimensionUpdater 与重构前的行为保持一致。
 *
 * 388 项：
 *   - correct: 24
 *   - wrong: 156
 *   - fuzz: 200
 *   - input immutability: 8
 */

import { DimensionUpdater as LegacyDimensionUpdater } from './__fixtures__/DimensionUpdater.legacy.js';
import { DimensionUpdater as CurrentDimensionUpdater } from '../../simulator/DimensionUpdater.js';

const legacy = new LegacyDimensionUpdater();
const current = new CurrentDimensionUpdater();

const VERIFICATIONS = ['choice', 'spelling', 'dictation', 'usage'];

const DIMENSIONS_MAP = {
  choice: ['meaning'],
  spelling: ['spelling'],
  dictation: ['spelling', 'listening'],
  usage: ['usage'],
};

function scoresEqual(a, b) {
  return (
    a.meaning === b.meaning &&
    a.spelling === b.spelling &&
    a.listening === b.listening &&
    a.usage === b.usage
  );
}

function changedEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];

    if (x.dimension !== y.dimension) return false;
    if (x.before !== y.before) return false;
    if (x.after !== y.after) return false;

    const xKeys = Object.keys(x).sort();
    const yKeys = Object.keys(y).sort();

    if (xKeys.join(',') !== yKeys.join(',')) return false;

    for (const key of xKeys) {
      if (x[key] !== y[key]) return false;
    }
  }

  return true;
}

function compare(label, legacyResult, currentResult) {
  const ok =
    scoresEqual(legacyResult.scores, currentResult.scores) &&
    changedEqual(legacyResult.changed, currentResult.changed);

  if (!ok) {
    console.log(`❌ ${label}`);
    console.log(`   legacy : ${JSON.stringify(legacyResult)}`);
    console.log(`   current: ${JSON.stringify(currentResult)}`);
  }

  return ok;
}

let passed = 0;
let failed = 0;

console.log('\n=== correct 路径 ===');

const CORRECT_SCORES = [0, 25, 50, 75, 90, 100];

for (const verification of VERIFICATIONS) {
  for (const score of CORRECT_SCORES) {
    const scores = {
      meaning: score,
      spelling: score,
      listening: score,
      usage: score,
    };

    const legacyResult = legacy.applyCorrect({ scores, verification });
    const currentResult = current.applyCorrect({ scores, verification });

    const ok = compare(
      `correct ${verification} score=${score}`,
      legacyResult,
      currentResult
    );

    if (ok) passed++;
    else failed++;
  }
}

console.log(`correct: ${passed} / 24`);

console.log('\n=== wrong 路径 ===');

const EDGE_SCORES = [0, 1, 38, 39, 40, 68, 69, 70, 88, 89, 90, 99, 100];
const MULTIPLIERS = [0.5, 0.75, 1.0];

const wrongTotal =
  VERIFICATIONS.length * EDGE_SCORES.length * MULTIPLIERS.length;

let wrongPassed = 0;
let wrongFailed = 0;

for (const verification of VERIFICATIONS) {
  const dimensions = DIMENSIONS_MAP[verification];

  for (const score of EDGE_SCORES) {
    for (const multiplier of MULTIPLIERS) {
      const scores = {
        meaning: score,
        spelling: score,
        listening: score,
        usage: score,
      };

      const stabilityAtEpisodeStart = (1 - multiplier) / 0.5;

      const legacyResult = legacy.applyError({
        scores,
        dimensions,
        stabilityAtEpisodeStart,
      });

      const currentResult = current.applyError({
        scores,
        dimensions,
        stabilityAtEpisodeStart,
      });

      const ok = compare(
        `wrong ${verification} score=${score} mult=${multiplier}`,
        legacyResult,
        currentResult
      );

      if (ok) wrongPassed++;
      else wrongFailed++;
    }
  }
}

console.log(`wrong: ${wrongPassed} / ${wrongTotal}`);

console.log('\n=== 随机 fuzz (100 组) ===');

let randomSeed = 20261007;

function random() {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
  return randomSeed / 4294967296;
}

function randomScore() {
  return Math.floor(random() * 101);
}

function randomVerification() {
  return VERIFICATIONS[Math.floor(random() * VERIFICATIONS.length)];
}

const FUZZ_COUNT = 100;
let fuzzPassed = 0;
let fuzzFailed = 0;

for (let i = 0; i < FUZZ_COUNT; i++) {
  const scores = {
    meaning: randomScore(),
    spelling: randomScore(),
    listening: randomScore(),
    usage: randomScore(),
  };

  const verification = randomVerification();
  const dimensions = DIMENSIONS_MAP[verification];
  const stabilityAtEpisodeStart = random();

  {
    const legacyResult = legacy.applyCorrect({ scores, verification });
    const currentResult = current.applyCorrect({ scores, verification });
    const ok = compare(
      `fuzz correct #${i} ${verification}`,
      legacyResult,
      currentResult
    );

    if (ok) fuzzPassed++;
    else fuzzFailed++;
  }

  {
    const legacyResult = legacy.applyError({
      scores,
      dimensions,
      stabilityAtEpisodeStart,
    });

    const currentResult = current.applyError({
      scores,
      dimensions,
      stabilityAtEpisodeStart,
    });

    const ok = compare(
      `fuzz wrong #${i} ${verification}`,
      legacyResult,
      currentResult
    );

    if (ok) fuzzPassed++;
    else fuzzFailed++;
  }
}

const fuzzTotal = FUZZ_COUNT * 2;
console.log(`fuzz: ${fuzzPassed} / ${fuzzTotal}`);

console.log('\n=== Input immutability ===');

let immutPassed = 0;
let immutFailed = 0;

for (const verification of VERIFICATIONS) {
  {
    const scores = {
      meaning: 50,
      spelling: 50,
      listening: 50,
      usage: 50,
    };
    const snapshot = JSON.stringify(scores);

    current.applyCorrect({ scores, verification });

    if (JSON.stringify(scores) === snapshot) {
      immutPassed++;
    } else {
      immutFailed++;
      console.log(`❌ correct ${verification} 修改了 input`);
    }
  }

  {
    const scores = {
      meaning: 50,
      spelling: 50,
      listening: 50,
      usage: 50,
    };
    const snapshot = JSON.stringify(scores);

    current.applyError({
      scores,
      dimensions: DIMENSIONS_MAP[verification],
      stabilityAtEpisodeStart: 0.5,
    });

    if (JSON.stringify(scores) === snapshot) {
      immutPassed++;
    } else {
      immutFailed++;
      console.log(`❌ wrong ${verification} 修改了 input`);
    }
  }
}

console.log(`immutability: ${immutPassed} / 8`);

const totalPassed = passed + wrongPassed + fuzzPassed + immutPassed;
const totalFailed = failed + wrongFailed + fuzzFailed + immutFailed;

console.log('\n============================================');
console.log(`PASSED : ${totalPassed}`);
console.log(`FAILED : ${totalFailed}`);
console.log('============================================');

if (totalFailed > 0) {
  process.exit(1);
}

console.log('\n✅ Step 3a-5 通过。可以进 Step 3a-6（365 天等价验证）。');
