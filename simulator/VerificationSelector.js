import { DIMENSIONS } from './constants.js';

const VERIFICATION_FOR = {
  meaning: 'choice',
  spelling: 'spelling',
  listening: 'dictation',
  usage: 'usage'
};

export class VerificationSelector {
  constructor({ dimensionCooldownDays = 2 } = {}) {
    this.reviewCount = 0;
    this.dimensionCooldownDays = dimensionCooldownDays;
    this.cooldownExpiry = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0]));
    this.lastVerifiedAt = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0]));
    this.scores = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0]));
  }

  select(day) {
    const reviewCount = this.reviewCount;

    if (reviewCount === 0) return { verification: 'choice', selectedDimension: 'meaning' };
    if (reviewCount === 1) return { verification: 'spelling', selectedDimension: 'spelling' };
    if (reviewCount === 2) return { verification: 'dictation', selectedDimension: 'listening' };
    if (reviewCount === 3) return { verification: 'usage', selectedDimension: 'usage' };

    const candidates = DIMENSIONS.filter((dimension) => this.cooldownExpiry[dimension] <= day);
    let target;

    if (candidates.length === 0) {
      target = [...DIMENSIONS].sort(
        (a, b) =>
          (this.cooldownExpiry[a] - this.cooldownExpiry[b]) ||
          (this.lastVerifiedAt[a] - this.lastVerifiedAt[b]) ||
          a.localeCompare(b)
      )[0];
    } else {
      const lowest = Math.min(...candidates.map((dimension) => this.scores[dimension]));
      const tied = candidates.filter((dimension) => this.scores[dimension] === lowest);
      target = [...tied].sort(
        (a, b) =>
          (this.lastVerifiedAt[a] - this.lastVerifiedAt[b]) ||
          a.localeCompare(b)
      )[0];
    }

    return { verification: VERIFICATION_FOR[target], selectedDimension: target };
  }

  record(verification, selectedDimension, touchedDimensions, day, scores) {
    if (!scores) {
      console.error('record called without scores', { verification, day });
    }

    for (const dimension of touchedDimensions) {
      this.lastVerifiedAt[dimension] = day;
    }

    this.cooldownExpiry[selectedDimension] = day + this.dimensionCooldownDays;
    this.scores = { ...scores };
    this.reviewCount += 1;
  }
}
