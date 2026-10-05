import { DIMENSIONS } from './constants.js';

export class MasteryCalculator {
  calculate(scores) {
    const values = DIMENSIONS.map((dimension) => scores[dimension]);
    const covered = values.filter((value) => value >= 25).length;
    const coverage = 0.3 + 0.7 * (covered / 4);
    const lowest = Math.min(...values);
    const others = (values.reduce((a, b) => a + b, 0) - lowest) / 3;
    const base = lowest * 0.4 + others * 0.6;
    const overall = base * coverage;
    return { covered, coverage, lowest, base, overall, state: this.getState(overall) };
  }
  getState(overall) {
    if (overall <= 0) return '未學';
    if (overall < 25) return '初識';
    if (overall < 45) return '模糊';
    if (overall < 65) return '熟悉';
    if (overall < 85) return '掌握';
    return '穩固';
  }
}
