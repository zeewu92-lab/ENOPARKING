import { STATE_INTERVALS } from './constants.js';
import { clamp, roundHalfUp } from './utils.js';

export class Scheduler {
  schedule({ state, stability, reviewedAtDay }) {
    const baseInterval = STATE_INTERVALS[state];
    const modifier = clamp(stability + 0.5, 0.60, 1.55);
    const interval = roundHalfUp(baseInterval * modifier);
    return { baseInterval, modifier, interval, nextReviewDay: reviewedAtDay + interval };
  }
}
