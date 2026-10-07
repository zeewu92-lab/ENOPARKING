import { computeUnitResult } from './completion.js';

const cases = [
  { name: '单一 correct', input: [{ result: 'correct' }], expect: 'correct' },
  { name: '两次 correct', input: [{ result: 'correct' }, { result: 'correct' }], expect: 'correct' },
  { name: '三次 correct', input: [{ result: 'correct' }, { result: 'correct' }, { result: 'correct' }], expect: 'correct' },
  { name: '✗ ✓', input: [{ result: 'wrong' }, { result: 'correct' }], expect: 'weak' },
  { name: '✗ ✓ ✓', input: [{ result: 'wrong' }, { result: 'correct' }, { result: 'correct' }], expect: 'weak' },
  { name: '✓ ✗ ✓', input: [{ result: 'correct' }, { result: 'wrong' }, { result: 'correct' }], expect: 'weak' },
  { name: '单一 wrong', input: [{ result: 'wrong' }], expect: 'wrong' },
  { name: '✗ ✗', input: [{ result: 'wrong' }, { result: 'wrong' }], expect: 'wrong' },
  { name: '✓ ✗', input: [{ result: 'correct' }, { result: 'wrong' }], expect: 'wrong' },
  { name: '✓ ✓ ✗', input: [{ result: 'correct' }, { result: 'correct' }, { result: 'wrong' }], expect: 'wrong' },
  { name: '✗ ✓ ✗', input: [{ result: 'wrong' }, { result: 'correct' }, { result: 'wrong' }], expect: 'wrong' },
];

const errorCases = [
  { name: '空数组 → 抛错', fn: () => computeUnitResult([]) },
  { name: '非数组 → 抛错', fn: () => computeUnitResult(null) },
  { name: '无效 result → 抛错', fn: () => computeUnitResult([{ result: 'error' }]) },
];

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  const result = computeUnitResult(testCase.input);
  if (result === testCase.expect) {
    console.log(`✅ ${testCase.name}`);
    passed++;
  } else {
    console.log(`❌ ${testCase.name} 预期=${testCase.expect} 实际=${result}`);
    failed++;
  }
}

for (const testCase of errorCases) {
  try {
    testCase.fn();
    console.log(`❌ ${testCase.name}（未抛错）`);
    failed++;
  } catch {
    console.log(`✅ ${testCase.name}`);
    passed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  throw new Error(`completion.test.js: ${failed} 个测试失败`);
}
