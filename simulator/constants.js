/**
 * Simulator 常量。
 *
 * 共享学习规则已迁移到 shared/learning/constants.js。
 * 这里保留原有导出路径，避免影响现有 Simulator 模块。
 */

export {
  MASTERY_GAINS,
  DIMENSION_SETS,
  DIMENSION_PENALTIES,
  penaltyFor,
} from '../shared/learning/constants.js';

export const EVIDENCE_SCALE = 10;
export const DIMENSIONS = ['meaning', 'spelling', 'listening', 'usage'];
export const STATE_INTERVALS = { 初識: 1, 模糊: 3, 熟悉: 7, 掌握: 14, 穩固: 30 };
export const STABILITY_BANDS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
export const REQUIRED_RECOVERY_UNITS = { '0.5->0.6': 2, '0.6->0.7': 4, '0.7->0.8': 8, '0.8->0.9': 16, '0.9->1.0': 32 };
export const ERROR_RETENTION = { weak: 1.0, medium: 0.5, strong: 0 };
export const SAME_CONTEXT_FACTORS = [1.0, 0.5, 0.25, 0];
export const VERIFICATION_EVIDENCE = {
  sameDay: { choice: 2, spelling: 4, dictation: 6, usage: 7 },
  crossDay: { choice: 5, spelling: 10, dictation: 8, usage: 17 },
  multiDay: { choice: 7, spelling: 15, dictation: 20, usage: 24 },
};
export const SIMULATOR_DEFAULTS = { reviewCap: 20, newTarget: 10, dailyMax: 30, eventMultiplier: 1.0 };
