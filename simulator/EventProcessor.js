import { DIMENSION_SETS, VERIFICATION_EVIDENCE } from './constants.js';
import { MasteryCalculator } from './MasteryCalculator.js';
import { VerificationSelector } from './VerificationSelector.js';

function evidenceBucket(dayDelta) {
  if (dayDelta <= 0) return 'sameDay';
  if (dayDelta === 1) return 'crossDay';
  return 'multiDay';
}

function effectivenessFor(hintLevel, result) {
  if (result !== 'correct') return 'invalid';
  if (hintLevel === 'answer') return 'weak valid';
  if (hintLevel === 'first-letter') return 'valid';
  return 'strong valid';
}

function transitionReason(before, after) {
  return before !== after ? before + '→' + after : null;
}

export class EventProcessor {
  constructor({ dimensionUpdater, stabilityEngine, eventMultiplier = 1.0 }) {
    this.dimensionUpdater = dimensionUpdater;
    this.stabilityEngine = stabilityEngine;
    this.eventMultiplier = eventMultiplier;
    this.lastEffectiveDayByWord = new Map();
    this.masteryCalculator = new MasteryCalculator();
    this.eventSequence = 0;
    this.verificationSelectors = new Map();
  }

  selectorFor(wordId) {
    if (!this.verificationSelectors.has(wordId)) {
      this.verificationSelectors.set(wordId, new VerificationSelector());
    }
    return this.verificationSelectors.get(wordId);
  }

  nextEventId(wordId, day) {
    this.eventSequence += 1;
    return 'evt-' + day + '-' + wordId + '-' + this.eventSequence;
  }

  evidenceStrength({ wordId, day, verification }) {
    const previousDay = this.lastEffectiveDayByWord.get(wordId);
    const bucket = previousDay == null ? 'sameDay' : evidenceBucket(day - previousDay);
    return VERIFICATION_EVIDENCE[bucket][verification];
  }

  process({ wordId, day, verification, result = 'correct', hintLevel = 'none', scores }) {
    const selector = this.selectorFor(wordId);
    const reviewCountBefore = selector.reviewCount;
    const selected = selector.select(day);

    if (verification !== selected.verification) {
      throw new Error(
        'Verification mismatch for ' + wordId +
        ': expected ' + selected.verification +
        ', received ' + verification
      );
    }

    const eventId = this.nextEventId(wordId, day);
    const dimensions = DIMENSION_SETS[verification] ?? [];
    const selectedDimension = selected.selectedDimension;
    const effectiveness = effectivenessFor(hintLevel, result);
    const masteryBefore = this.masteryCalculator.calculate(scores);

    if (result !== 'correct') {
      const episode = this.stabilityEngine.registerError({ wordId, day, verification, dimensions });
      const updated = this.dimensionUpdater.applyError({ scores, dimensions, stabilityAtEpisodeStart: episode.episode.s0 });
      const masteryAfter = this.masteryCalculator.calculate(updated.scores);
      selector.record(verification, selectedDimension, dimensions, day, updated.scores);
      return {
        kind: 'error',
        event: {
          eventId,
          wordId,
          day,
          reviewCount: reviewCountBefore,
          verification,
          selectedDimension,
          hintLevel,
          result,
          dimensions,
          effectiveness,
          stateBefore: masteryBefore.state,
          stateAfter: masteryAfter.state,
          stateTransitionTriggered: false,
          transitionReason: null,
          errorStrength: episode.strength,
          evidenceStrength: 0,
          dimensionChanges: updated.changed
        },
        scores: updated.scores,
        recovery: null,
        closedEpisode: episode.closed,
        closedEpisodeScores: episode.closed ? { ...scores } : null
      };
    }

    const closedEpisode = this.stabilityEngine.endErrorEpisode();
    const evidence = this.evidenceStrength({ wordId, day, verification });
    const updated = this.dimensionUpdater.applyCorrect({ scores, verification });
    const masteryAfter = this.masteryCalculator.calculate(updated.scores);
    const stateTransitionTriggered = masteryAfter.state !== masteryBefore.state;
    const recovery = this.stabilityEngine.applyRecovery({
      wordId,
      day,
      verification,
      dimensions,
      evidenceStrength: evidence,
      eventMultiplier: this.eventMultiplier,
      dimensionEvidence: 1.0
    });
    this.lastEffectiveDayByWord.set(wordId, day);
    selector.record(verification, selectedDimension, dimensions, day, updated.scores);

    return {
      kind: 'correct',
      event: {
        eventId,
        wordId,
        day,
        reviewCount: reviewCountBefore,
        verification,
        selectedDimension,
        hintLevel,
        result,
        dimensions,
        effectiveness,
        stateBefore: masteryBefore.state,
        stateAfter: masteryAfter.state,
        stateTransitionTriggered,
        transitionReason: transitionReason(masteryBefore.state, masteryAfter.state),
        evidenceStrength: evidence,
        effectiveEvidence: recovery.evidence,
        diminishingFactor: recovery.factor,
        dimensionChanges: updated.changed
      },
      scores: updated.scores,
      recovery,
      closedEpisode,
      closedEpisodeScores: closedEpisode ? { ...scores } : null
    };
  }
}
