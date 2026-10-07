import { createVerificationPlan } from './plan.js';

const mockSelector = {
  ranking: [],
  primary: 'spelling',
  secondary: 'listening',
};

const cases = [
  {
    name: 'New → 1 action, meaning@0',
    input: {
      unitId: 'u1', wordId: 'w1', source: 'new',
      schedulerState: '初识', lastResult: null,
      selectorResult: mockSelector, createdAt: 1001,
    },
    expect: {
      actionCount: 1,
      actions: [{ index: 0, dimension: 'meaning', variantIndex: 0 }],
    },
  },
  {
    name: 'Review 掌握 → 1 action',
    input: {
      unitId: 'u2', wordId: 'w2', source: 'review',
      schedulerState: '掌握', lastResult: 'correct',
      selectorResult: mockSelector, createdAt: 1002,
    },
    expect: {
      actionCount: 1,
      actions: [{ index: 0, dimension: 'spelling', variantIndex: 0 }],
    },
  },
  {
    name: 'Review 熟悉 → 2 actions (primary + secondary)',
    input: {
      unitId: 'u3', wordId: 'w3', source: 'review',
      schedulerState: '熟悉', lastResult: 'correct',
      selectorResult: mockSelector, createdAt: 1003,
    },
    expect: {
      actionCount: 2,
      actions: [
        { index: 0, dimension: 'spelling', variantIndex: 0 },
        { index: 1, dimension: 'listening', variantIndex: 0 },
      ],
    },
  },
  {
    name: 'Review 模糊 → 2 actions (primary × 2 variants)',
    input: {
      unitId: 'u4', wordId: 'w4', source: 'review',
      schedulerState: '模糊', lastResult: 'correct',
      selectorResult: mockSelector, createdAt: 1004,
    },
    expect: {
      actionCount: 2,
      actions: [
        { index: 0, dimension: 'spelling', variantIndex: 0 },
        { index: 1, dimension: 'spelling', variantIndex: 1 },
      ],
    },
  },
  {
    name: 'Review 初识 → 3 actions',
    input: {
      unitId: 'u5', wordId: 'w5', source: 'review',
      schedulerState: '初识', lastResult: null,
      selectorResult: mockSelector, createdAt: 1005,
    },
    expect: {
      actionCount: 3,
      actions: [
        { index: 0, dimension: 'spelling', variantIndex: 0 },
        { index: 1, dimension: 'spelling', variantIndex: 1 },
        { index: 2, dimension: 'listening', variantIndex: 0 },
      ],
    },
  },
  {
    name: 'lastResult=wrong 修正 Strong → Weak',
    input: {
      unitId: 'u6', wordId: 'w6', source: 'review',
      schedulerState: '掌握', lastResult: 'wrong',
      selectorResult: mockSelector, createdAt: 1006,
    },
    expect: {
      actionCount: 2,
      actions: [
        { index: 0, dimension: 'spelling', variantIndex: 0 },
        { index: 1, dimension: 'spelling', variantIndex: 1 },
      ],
    },
  },
  {
    name: 'lastResult=weak 修正 Strong → Weak',
    input: {
      unitId: 'u7', wordId: 'w7', source: 'review',
      schedulerState: '稳固', lastResult: 'weak',
      selectorResult: mockSelector, createdAt: 1007,
    },
    expect: {
      actionCount: 2,
      actions: [
        { index: 0, dimension: 'spelling', variantIndex: 0 },
        { index: 1, dimension: 'spelling', variantIndex: 1 },
      ],
    },
  },
  {
    name: 'lastResult=wrong 修正 Weak → Weak',
    input: {
      unitId: 'u8', wordId: 'w8', source: 'review',
      schedulerState: '模糊', lastResult: 'wrong',
      selectorResult: mockSelector, createdAt: 1008,
    },
    expect: {
      actionCount: 2,
      actions: [
        { index: 0, dimension: 'spelling', variantIndex: 0 },
        { index: 1, dimension: 'spelling', variantIndex: 1 },
      ],
    },
  },
  {
    name: 'lastResult=wrong 修正 Unstable → Unstable',
    input: {
      unitId: 'u9', wordId: 'w9', source: 'review',
      schedulerState: '初识', lastResult: 'wrong',
      selectorResult: mockSelector, createdAt: 1009,
    },
    expect: {
      actionCount: 3,
      actions: [
        { index: 0, dimension: 'spelling', variantIndex: 0 },
        { index: 1, dimension: 'spelling', variantIndex: 1 },
        { index: 2, dimension: 'listening', variantIndex: 0 },
      ],
    },
  },
];

let passed = 0;

for (const testCase of cases) {
  const result = createVerificationPlan(testCase.input);
  const ok =
    result.id === 'vp_' + testCase.input.unitId &&
    result.createdAt === testCase.input.createdAt &&
    result.actionCount === testCase.expect.actionCount &&
    JSON.stringify(result.actions) === JSON.stringify(testCase.expect.actions);

  if (!ok) {
    throw new Error(
      testCase.name +
        ': expected ' +
        JSON.stringify(testCase.expect) +
        ', got ' +
        JSON.stringify({
          actionCount: result.actionCount,
          actions: result.actions,
        })
    );
  }

  console.log('PASS ' + testCase.name);
  passed += 1;
}

console.log(passed + ' passed, 0 failed');
