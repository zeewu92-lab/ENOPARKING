import { DailyBatch } from '../../../simulator/DailyBatch.js';
import { DimensionUpdater } from '../../../simulator/DimensionUpdater.js';
import { EventProcessor } from '../../../simulator/EventProcessor.js';
import { MasteryCalculator } from '../../../simulator/MasteryCalculator.js';
import { Scheduler } from '../../../simulator/Scheduler.js';
import { StabilityEngine } from '../../../simulator/StabilityEngine.js';
import { VerificationSelector } from '../../../simulator/VerificationSelector.js';

export {
  DailyBatch,
  DimensionUpdater,
  EventProcessor,
  MasteryCalculator,
  Scheduler,
  StabilityEngine,
  VerificationSelector
};

export const LEARNING_ALGORITHM_VERSION = 'v1.0';

export function createLearningAlgorithm(options = {}) {
  const dimensionUpdater = new DimensionUpdater();
  const stabilityEngine = new StabilityEngine({
    initialStability: options.initialStability ?? 0.5,
    initialProgress: options.initialProgress ?? 0
  });
  const processor = new EventProcessor({
    dimensionUpdater,
    stabilityEngine,
    eventMultiplier: options.eventMultiplier ?? 1.0
  });

  return {
    version: LEARNING_ALGORITHM_VERSION,
    processor,
    masteryCalculator: new MasteryCalculator(),
    scheduler: new Scheduler(),
    stabilityEngine,
    dailyBatch: new DailyBatch({
      reviewCap: options.reviewCap ?? 20,
      newTarget: options.newTarget ?? 5,
      dailyMax: options.dailyMax ?? 30
    }),
    verificationSelectors: new Map()
  };
}
