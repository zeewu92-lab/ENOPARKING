export class Reporter {
  format(row) {
    return {
      Day: row.day, event: row.event, S_before: row.stabilityBefore, p_before: row.progressBefore,
      evidence: row.evidence, S_after: row.stabilityAfter, p_after: row.progressAfter,
      masteryState: row.mastery.state, overall: Number(row.mastery.overall.toFixed(2)),
      M: row.scores.meaning, S: row.scores.spelling, L: row.scores.listening, U: row.scores.usage,
      base: row.schedule.baseInterval, modifier: Number(row.schedule.modifier.toFixed(2)),
      interval: row.schedule.interval, nextReview: row.schedule.nextReviewDay,
    };
  }
  print(rows) { console.table(rows.map((row) => this.format(row))); }
}
