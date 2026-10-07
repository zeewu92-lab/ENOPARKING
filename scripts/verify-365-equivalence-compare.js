/**
 * Step 3a-6：逐 error rate、逐 day、逐 word、逐字段比对 NDJSON 快照。
 */

import fs from 'fs';
import readline from 'readline';

const [,, beforePath, afterPath] = process.argv;

if (!beforePath || !afterPath) {
  console.error(
    '用法: node verify-365-equivalence-compare.js <before.jsonl> <after.jsonl>'
  );
  process.exit(1);
}

const beforeInput = fs.createReadStream(beforePath, { encoding: 'utf8' });
const afterInput = fs.createReadStream(afterPath, { encoding: 'utf8' });

const beforeLines = readline.createInterface({
  input: beforeInput,
  crlfDelay: Infinity,
});
const afterLines = readline.createInterface({
  input: afterInput,
  crlfDelay: Infinity,
});

const beforeIterator = beforeLines[Symbol.asyncIterator]();
const afterIterator = afterLines[Symbol.asyncIterator]();

let totalChecks = 0;
let divergenceCount = 0;
let firstDivergence = null;
let lineNumber = 0;

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

while (true) {
  const [beforeResult, afterResult] = await Promise.all([
    beforeIterator.next(),
    afterIterator.next(),
  ]);

  if (beforeResult.done || afterResult.done) {
    if (beforeResult.done !== afterResult.done) {
      console.error('❌ 两份快照行数不同');
      process.exit(1);
    }
    break;
  }

  lineNumber += 1;

  const beforeDay = JSON.parse(beforeResult.value);
  const afterDay = JSON.parse(afterResult.value);

  if (beforeDay.rate !== afterDay.rate || beforeDay.day !== afterDay.day) {
    console.error(
      `❌ 第 ${lineNumber} 行的 rate/day 不一致: ` +
      `${beforeDay.rate}%/day${beforeDay.day} vs ` +
      `${afterDay.rate}%/day${afterDay.day}`
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
        beforeDay.rate,
        beforeDay.day,
        wordId,
        field,
        beforeWord?.[field],
        afterWord?.[field]
      );
    }
  }
}

beforeLines.close();
afterLines.close();

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
