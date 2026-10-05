const KEY = 'engnocrazy:learningStats';

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function defaultStats() {
  return {
    totalWords: 0,
    todayWords: 0,
    studyDays: 0,
    streak: 0,
    longestStreak: 0,
    goalStreak: 0,
    longestGoalStreak: 0,
    lastStudyDate: '',
    lastGoalDate: '',
    earlyBird: 0,
    nightStudy: 0,
    bonusUses: 0,
    studyDates: [],
    completedStages: []
  };
}

export function huoquXuexiTongji() {
  if (typeof window === 'undefined') return defaultStats();
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return { ...defaultStats(), ...(saved || {}) };
  } catch {
    return defaultStats();
  }
}

function save(stats) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {}
}

export function jiluDanciLearned({ completedDailyGoal = false } = {}) {
  if (typeof window === 'undefined') return huoquXuexiTongji();

  const stats = huoquXuexiTongji();
  const today = todayKey();
  const hour = new Date().getHours();

  stats.totalWords += 1;
  stats.todayWords = stats.lastStudyDate === today ? Number(stats.todayWords || 0) + 1 : 1;

  if (!Array.isArray(stats.studyDates)) stats.studyDates = [];
  if (!stats.studyDates.includes(today)) stats.studyDates.push(today);

  if (stats.lastStudyDate !== today) {
    stats.studyDays += 1;
    stats.streak = stats.lastStudyDate === yesterdayKey() ? stats.streak + 1 : 1;
    stats.longestStreak = Math.max(stats.longestStreak, stats.streak);
    stats.lastStudyDate = today;
  }

  if (hour >= 6 && hour < 7) stats.earlyBird = 1;
  if (hour >= 23) stats.nightStudy = 1;

  if (completedDailyGoal) {
    if (stats.lastGoalDate !== today) {
      stats.goalStreak = stats.lastGoalDate === yesterdayKey() ? stats.goalStreak + 1 : 1;
      stats.longestGoalStreak = Math.max(stats.longestGoalStreak, stats.goalStreak);
      stats.lastGoalDate = today;
    }
  }

  save(stats);
  return stats;
}

export function jiluBonusShiyong() {
  if (typeof window === 'undefined') return huoquXuexiTongji();
  const stats = huoquXuexiTongji();
  stats.bonusUses += 1;
  save(stats);
  return stats;
}


export function jiluStageCompleted(stageNumber = 1) {
  if (typeof window === 'undefined') return huoquXuexiTongji();
  const stats = huoquXuexiTongji();
  if (!Array.isArray(stats.completedStages)) stats.completedStages = [];
  const stage = Math.max(1, Number(stageNumber) || 1);
  const today = todayKey();
  const key = String(stage) + '@' + today;
  if (!stats.completedStages.some(item => item.key === key)) {
    stats.completedStages.push({ key, stage, date: today });
  }
  save(stats);
  return stats;
}
