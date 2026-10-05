import { DimensionUpdater } from './DimensionUpdater.js';
import { EventProcessor } from './EventProcessor.js';
import { MasteryCalculator } from './MasteryCalculator.js';
import { Scheduler } from './Scheduler.js';
import { StabilityEngine } from './StabilityEngine.js';
import { DailyBatch } from './DailyBatch.js';
import { Reporter } from './Reporter.js';

export function createSimulator({ eventMultiplier = 1.0, reviewCap = 20, newTarget = 10, dailyMax = 30, initialStability = 0.5, initialProgress = 0 } = {}) {
  const dimensionUpdater = new DimensionUpdater();
  const stabilityEngine = new StabilityEngine({ initialStability, initialProgress });
  const processor = new EventProcessor({ dimensionUpdater, stabilityEngine, eventMultiplier });
  return { processor, masteryCalculator: new MasteryCalculator(), scheduler: new Scheduler(), stabilityEngine, dailyBatch: new DailyBatch({ reviewCap, newTarget, dailyMax }), reporter: new Reporter() };
}
function rowFrom({ day, event, evidence = 0, scores, before, after, mastery, schedule }) {
  return { day, event, scores: { ...scores }, evidence, stabilityBefore: before.stability, progressBefore: before.progress, stabilityAfter: after.stability, progressAfter: after.progress, mastery, schedule };
}
export function runPath({ initialScores, events, eventMultiplier = 1.0, initialStability = 0.5, initialProgress = 0 }) {
  const sim = createSimulator({ eventMultiplier, initialStability, initialProgress });
  let scores = { ...initialScores };
  const rows = [];
  for (const input of events) {
    const before = sim.stabilityEngine.snapshot();
    const result = sim.processor.process({ ...input, scores });
    scores = result.scores;
    if (result.closedEpisode) {
      const closureScores = result.closedEpisodeScores ?? scores;
      const mastery = sim.masteryCalculator.calculate(closureScores);
      const schedule = sim.scheduler.schedule({ state: mastery.state, stability: result.closedEpisode.newStability, reviewedAtDay: result.closedEpisode.day });
      rows.push(rowFrom({ day: result.closedEpisode.day, event: result.closedEpisode.verification + '-episode-' + result.closedEpisode.strength, evidence: 0, scores: closureScores, before: { stability: result.closedEpisode.oldStability, progress: result.closedEpisode.oldProgress }, after: { stability: result.closedEpisode.newStability, progress: result.closedEpisode.newProgress }, mastery, schedule }));
    }
    if (result.kind === 'correct') {
      const mastery = sim.masteryCalculator.calculate(scores);
      const schedule = sim.scheduler.schedule({ state: mastery.state, stability: result.recovery.after.stability, reviewedAtDay: input.day });
      rows.push(rowFrom({ day: input.day, event: input.verification, evidence: result.event.evidenceStrength, scores, before, after: result.recovery.after, mastery, schedule }));
    }
  }
  const finalEpisode = sim.stabilityEngine.endErrorEpisode();
  if (finalEpisode) {
    const mastery = sim.masteryCalculator.calculate(scores);
    const schedule = sim.scheduler.schedule({ state: mastery.state, stability: finalEpisode.newStability, reviewedAtDay: finalEpisode.day });
    rows.push(rowFrom({ day: finalEpisode.day, event: finalEpisode.verification + '-episode-' + finalEpisode.strength, evidence: 0, scores, before: { stability: finalEpisode.oldStability, progress: finalEpisode.oldProgress }, after: { stability: finalEpisode.newStability, progress: finalEpisode.newProgress }, mastery, schedule }));
  }
  return { rows, scores, simulator: sim };
}
export { DailyBatch };
