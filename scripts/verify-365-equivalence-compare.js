/**
 * Step 3a-6：逐 error rate、逐 day、逐 word、逐字段比对快照。
 */

import fs from 'fs';

const [,, beforePath, afterPath] = process.argv;

if (!beforePath || !afterPath) {
  console.error(
    '用法: node verify-365-equivalence-compare.js <before.json> <after.json>'
  );
  process.exit(1);
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

const beforeRates = Object.keys(before);
const afterRates = Object.keys(after);

if (JSON.stringify(beforeRates) !== JSON.stringify(afterRates)) {
  console.error('❌ error rate 集合不同');
  process.exit(1);
}

let totalChecks = 0;
let divergenceCount = 0;
let firstDivergence = null;

function compareValue(rate, day, wordId, field, beforeValue, afterValue) {
  totalChecks += 1;

  if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
    return;
  }

  divergenceCount += 1;

  if (!firstDivergence) {
    firstDivergence = {
      rate,
      day,
      wordId,
      field,
      before: JSON.stringify(beforeValue),
      after: JSON.stringify(afterValue),
    };
  }
}

console.log(`开始比对 ${beforeRates.length} 个 error rate...`);

for (const rate of beforeRates) {
  const beforeDays = before[rate];
  const afterDays = after[rate];

  if (beforeDays.length !== afterDays.length) {
    console.error(
      `❌ rate=${rate} 天数不同: ${beforeDays.length} vs ${afterDays.length}`
    );
    process.exit(1);
  }

  for (let index = 0; index < beforeDays.length; index += 1) {
    const beforeDay = beforeDays[index];
    const afterDay = afterDays[index];

    if (beforeDay.day !== afterDay.day) {
      console.error(
        `❌ rate=${rate} day 索引不同: ${beforeDay.day} vs ${afterDay.day}`
      );
      process.exit(1);
    }

    const wordIds = new Set([
      ...Object.keys(beforeDay.words),
      ...Object.keys(afterDay.words),
    ]);

    for (const wordId of wordIds) {
      const beforeWord = beforeDay.words[wordId];
      const afterWord = afterDay.words[wordId];

      const fields = new Set([
        ...Object.keys(beforeWord || {}),
        ...Object.keys(afterWord || {}),
      ]);

      for (const field of fields) {
        compareValue(
          rate,
          beforeDay.day,
          wordId,
          field,
          beforeWord?.[field],
          afterWord?.[field]
        );
      }
    }
  }
}

console.log(`\n总共比对 ${totalChecks} 个字段`);

if (!firstDivergence) {
  console.log('✅ 365 天 × 6 error rate 全部逐字段一致');
  process.exit(0);
}

console.error(`❌ 发现 ${divergenceCount} 个字段分歧`);
console.error('第一处分歧：');
console.error(`  rate   = ${firstDivergence.rate}%`);
console.error(`  day    = ${firstDivergence.day}`);
console.error(`  wordId = ${firstDivergence.wordId}`);
console.error(`  field  = ${firstDivergence.field}`);
console.error(`  before = ${firstDivergence.before}`);
console.error(`  after  = ${firstDivergence.after}`);

process.exit(1);
