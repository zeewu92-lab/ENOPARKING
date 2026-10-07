import fs from 'fs';

const [,, beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
  console.error('用法: node verify-365-equivalence-compare.js <before.json> <after.json>');
  process.exit(1);
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
const rates = Object.keys(before);

if (JSON.stringify(Object.keys(before)) !== JSON.stringify(Object.keys(after))) {
  console.error('❌ error rate 集合不同');
  process.exit(1);
}

console.log(`比對 ${rates.length} 個 error rate...`);
let totalChecks = 0;
const divergences = [];

for (const rate of rates) {
  const beforeDays = before[rate];
  const afterDays = after[rate];

  if (beforeDays.length !== afterDays.length) {
    console.error(`❌ rate=${rate} 天數不同`);
    process.exit(1);
  }

  for (let i = 0; i < beforeDays.length; i++) {
    const bDay = beforeDays[i];
    const aDay = afterDays[i];
    const allWordIds = new Set([...Object.keys(bDay.words), ...Object.keys(aDay.words)]);

    for (const wordId of allWordIds) {
      const bWord = bDay.words[wordId];
      const aWord = aDay.words[wordId];
      const fields = new Set([...Object.keys(bWord || {}), ...Object.keys(aWord || {})]);

      for (const field of fields) {
        totalChecks++;
        const bVal = JSON.stringify(bWord?.[field]);
        const aVal = JSON.stringify(aWord?.[field]);
        if (bVal !== aVal) {
          divergences.push({ rate, day: bDay.day, wordId, field, before: bVal, after: aVal });
        }
      }
    }
  }
}

console.log(`\n總共比對 ${totalChecks} 個欄位`);
if (divergences.length === 0) {
  console.log('✅ 365 天 × 6 error rate 全部逐欄位一致');
  process.exit(0);
}

console.log(`\n❌ 發現 ${divergences.length} 個分歧\n`);
const grouped = {};
for (const d of divergences) {
  const key = `${d.rate}%-day${d.day}`;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(d);
}
for (const key of Object.keys(grouped).slice(0, 5)) {
  console.log(`▶ ${key}  (${grouped[key].length} 個分歧)`);
  for (const d of grouped[key].slice(0, 3)) {
    console.log(`    ${d.wordId}.${d.field}`);
    console.log(`        before: ${d.before}`);
    console.log(`        after : ${d.after}`);
  }
  console.log('');
}
process.exit(1);
