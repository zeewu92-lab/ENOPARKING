export const EVIDENCE_SCALE = 10;
export const DIMENSIONS = ['meaning', 'spelling', 'listening', 'usage'];
export const STATE_INTERVALS = { 初識: 1, 模糊: 3, 熟悉: 7, 掌握: 14, 穩固: 30 };
export const STABILITY_BANDS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
export const REQUIRED_RECOVERY_UNITS = { '0.5->0.6': 2, '0.6->0.7': 4, '0.7->0.8': 8, '0.8->0.9': 16, '0.9->1.0': 32 };
export const ERROR_RETENTION = { weak: 1.0, medium: 0.5, strong: 0 };
export const SAME_CONTEXT_FACTORS = [1.0, 0.5, 0.25, 0];
export const DIMENSION_PENALTIES = [
  { min: 0, max: 39, penalty: 5 },
  { min: 40, max: 69, penalty: 8 },
  { min: 70, max: 89, penalty: 10 },
  { min: 90, max: 100, penalty: 12 },
];
export const VERIFICATION_EVIDENCE = {
  sameDay: { choice: 2, spelling: 4, dictation: 6, usage: 7 },
  crossDay: { choice: 5, spelling: 10, dictation: 8, usage: 17 },
  multiDay: { choice: 7, spelling: 15, dictation: 20, usage: 24 },
};
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
export const SIMULATOR_DEFAULTS = { reviewCap: 20, newTarget: 10, dailyMax: 30, eventMultiplier: 1.0 };
