import { penaltyFor } from '../shared/learning/constants.js';
import { applyVerificationToScores } from '../shared/learning/verificationScores.js';

export class DimensionUpdater {
  penaltyFor(score) {
    return penaltyFor(score);
  }

  applyCorrect({ scores, verification }) {
    return applyVerificationToScores({
      scores,
      verification,
      result: 'correct',
    });
  }

  applyError({ scores, dimensions, stabilityAtEpisodeStart }) {
    const errorMultiplier = 1 - 0.5 * stabilityAtEpisodeStart;

    return applyVerificationToScores({
      scores,
      verification: null,
      dimensions,
      result: 'wrong',
      errorMultiplier,
    });
  }
}
