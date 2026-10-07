import { DIMENSION_PENALTIES, MASTERY_GAINS } from '../constants.js';
import { clamp, roundHalfUp } from '../../../simulator/utils.js';

export class DimensionUpdater {
  penaltyFor(score) {
    return DIMENSION_PENALTIES.find(({ min, max }) => score >= min && score <= max)?.penalty ?? 5;
  }

  applyCorrect({ scores, verification }) {
    const gains = MASTERY_GAINS[verification];
    const next = { ...scores };
    const changed = [];

    for (const [dimension, delta] of Object.entries(gains)) {
      const before = next[dimension];
      const actualDelta = roundHalfUp(delta);
      const after = clamp(before + actualDelta, 0, 100);
      next[dimension] = after;
      changed.push({ dimension, before, delta: actualDelta, after });
    }

    return { scores: next, changed };
  }

  applyError({ scores, dimensions, stabilityAtEpisodeStart }) {
    const multiplier = 1 - 0.5 * stabilityAtEpisodeStart;
    const next = { ...scores };
    const changed = [];

    for (const dimension of dimensions) {
      const before = next[dimension];
      const basePenalty = this.penaltyFor(before);
      const adjustedPenalty = basePenalty * multiplier;
      const after = Math.max(0, roundHalfUp(before - adjustedPenalty));
      next[dimension] = after;
      changed.push({ dimension, before, basePenalty, adjustedPenalty, after });
    }

    return { scores: next, changed };
  }
}
