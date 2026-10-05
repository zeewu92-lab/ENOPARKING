export class DailyBatch {
  constructor({ reviewCap = 20, newTarget = 10, dailyMax = 30 } = {}) {
    this.reviewCap = reviewCap;
    this.newTarget = newTarget;
    this.dailyMax = dailyMax;
  }
  generate({ words, today }) {
    const due = words
      .filter((word) => word.nextReviewAt != null && word.nextReviewAt <= today)
      .sort((a, b) =>
        (b.overdueDays - a.overdueDays) ||
        (b.errorStreakWindow - a.errorStreakWindow) ||
        (a.lowestDimension - b.lowestDimension) ||
        (a.lastSeenAt - b.lastSeenAt) ||
        String(a.wordId).localeCompare(String(b.wordId))
      );
    const reviews = due.slice(0, this.reviewCap);
    const reviewIds = new Set(reviews.map((word) => word.wordId));
    const newWords = words
      .filter((word) => !reviewIds.has(word.wordId) && word.isNew && word.nextReviewAt == null)
      .sort((a, b) => String(a.wordId).localeCompare(String(b.wordId)))
      .slice(0, this.newTarget);
    return [...reviews, ...newWords].slice(0, this.dailyMax);
  }
}
