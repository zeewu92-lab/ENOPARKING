/**
 * 共享学习常量。
 *
 * 这里只放 Simulator 和产品层共同使用的规则。
 */

export const MASTERY_GAINS = {
  choice: { meaning: 25 },
  spelling: { spelling: 30 },
  dictation: { spelling: 25, listening: 25 },
  usage: { usage: 30 },
};

export const DIMENSION_SETS = {
  choice: ['meaning'],
  spelling: ['spelling'],
  dictation: ['spelling', 'listening'],
  usage: ['usage'],
};

export const DIMENSION_PENALTIES = [
  { min: 0, max: 39, penalty: 5 },
  { min: 40, max: 69, penalty: 8 },
  { min: 70, max: 89, penalty: 10 },
  { min: 90, max: 100, penalty: 12 },
];

export function penaltyFor(score) {
  return DIMENSION_PENALTIES.find(
    ({ min, max }) => score >= min && score <= max
  )?.penalty ?? 5;
}
