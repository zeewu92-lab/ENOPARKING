import { selectDimensions } from './selector.js';

const cases = [
  {
    name: '四个维度从未验证',
    input: {
      wordId: 'w1',
      scores: { meaning: 100, spelling: 100, listening: 100, usage: 100 },
      eventHistory: [],
      currentDay: 200,
    },
    expect: { primary: 'listening', secondary: 'meaning' },
  },
  {
    name: 'spelling 在 cooldown',
    input: {
      wordId: 'w2',
      scores: { meaning: 100, spelling: 100, listening: 100, usage: 100 },
      eventHistory: [{ verification: 'spelling', day: 182 }],
      currentDay: 183,
    },
    expect: { primary: 'listening', secondary: 'meaning' },
  },
  {
    name: '四个全在 cooldown',
    input: {
      wordId: 'w3',
      scores: { meaning: 80, spelling: 50, listening: 60, usage: 70 },
      eventHistory: [
        { verification: 'choice', day: 182 },
        { verification: 'spelling', day: 182 },
        { verification: 'dictation', day: 182 },
        { verification: 'usage', day: 182 },
      ],
      currentDay: 183,
    },
    expect: { primary: 'spelling', secondary: 'listening' },
  },
  {
    name: 'dictation 同时冷却 spelling + listening',
    input: {
      wordId: 'w4',
      scores: { meaning: 100, spelling: 100, listening: 100, usage: 100 },
      eventHistory: [{ verification: 'dictation', day: 182 }],
      currentDay: 183,
    },
    expect: { primary: 'meaning', secondary: 'usage' },
  },
  {
    name: 'score 相同時比较 lastVerifiedDay',
    input: {
      wordId: 'w5',
      scores: { meaning: 100, spelling: 100, listening: 100, usage: 100 },
      eventHistory: [
        { verification: 'choice', day: 170 },
        { verification: 'spelling', day: 180 },
      ],
      currentDay: 190,
    },
    expect: { primary: 'listening', secondary: 'usage' },
  },
  {
    name: '所有条件相同走字典序',
    input: {
      wordId: 'w6',
      scores: { meaning: 100, spelling: 100, listening: 100, usage: 100 },
      eventHistory: [],
      currentDay: 200,
    },
    expect: { primary: 'listening', secondary: 'meaning' },
  },
];

let passed = 0;

for (const testCase of cases) {
  const result = selectDimensions(testCase.input);
  const ok =
    result.primary === testCase.expect.primary &&
    result.secondary === testCase.expect.secondary;

  if (!ok) {
    throw new Error(
      testCase.name +
        ': expected ' +
        testCase.expect.primary +
        '/' +
        testCase.expect.secondary +
        ', got ' +
        result.primary +
        '/' +
        result.secondary
    );
  }

  console.log('PASS ' + testCase.name);
  passed += 1;
}

console.log(passed + ' passed, 0 failed');
