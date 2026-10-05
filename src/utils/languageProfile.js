import { huoquXuexiTongji } from './learningStats.js';
import { huoquCuowuShu } from './wrongBook.js';
import { huoquJiyiRecord } from './memorySystem.js';

const MEMORY_MAX_LEVEL = 6;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getMemoryWordList() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem('engnocrazy:memory:v1') || '{}');
    return raw && typeof raw === 'object' ? Object.keys(raw) : [];
  } catch {
    return [];
  }
}

function goujianJiyiSummary(wordList) {
  const keys = Array.isArray(wordList) ? wordList : [];
  let levelSum = 0;
  let attempts = 0;
  let correct = 0;
  let wrong = 0;
  let assisted = 0;
  const errors = { omission: 0, extraLetter: 0, transposition: 0, spelling: 0 };

  keys.forEach(word => {
    const jilu = huoquJiyiRecord(word);
    levelSum += Number(jilu.level || 0);
    attempts += Number(jilu.attempts || 0);
    correct += Number(jilu.correct || 0);
    wrong += Number(jilu.wrong || 0);
    assisted += Number(jilu.assisted || 0);
    Object.keys(errors).forEach(type => {
      errors[type] += Number(jilu.errorTypes?.[type] || 0);
    });
  });

  return { count: keys.length, levelSum, attempts, correct, wrong, assisted, errors };
}

export function huoquYuyanZiliao() {
  const stats = huoquXuexiTongji();
  const wrongShu = huoquCuowuShu();
  const jiyi = goujianJiyiSummary(getMemoryWordList());

  const studied = Math.max(Number(stats.totalWords || 0), jiyi.count);
  const accuracy = jiyi.attempts > 0
    ? jiyi.correct / jiyi.attempts
    : 0;

  const mastery = jiyi.count > 0
    ? jiyi.levelSum / (jiyi.count * MEMORY_MAX_LEVEL)
    : 0;

  const spellingAttempts = Object.values(jiyi.errors).reduce((sum, value) => sum + Number(value || 0), 0);
  const spellingAccuracy = jiyi.attempts > 0
    ? Math.max(0, 1 - (spellingAttempts / Math.max(1, jiyi.attempts)))
    : 0;

  const consistency = Number(stats.studyDays || 0) > 0
    ? Math.min(1, Number(stats.studyDays || 0) / 30)
    : 0;

  const ciku = jiyi.attempts > 0 ? clamp(mastery * 100) : 0;

  const recall = jiyi.attempts > 0
    ? clamp(accuracy * 65 + mastery * 35)
    : 0;

  const spelling = jiyi.attempts > 0
    ? clamp(spellingAccuracy * 70 + mastery * 30)
    : 0;

  const persistence = clamp(consistency * 70 + Math.min(30, Number(stats.longestStreak || 0) * 2));

  const topWrong = Object.entries(jiyi.errors)
    .sort((a, b) => b[1] - a[1])[0];

  let insight = '開始學習後，這裡會逐漸形成你的語言學習輪廓。';
  if (jiyi.attempts > 0) {
    if (topWrong?.[1] > 0 && topWrong[0] === 'transposition') {
      insight = '你目前較容易在拼寫順序上出錯，可以多做一次主動默寫。';
    } else if (topWrong?.[1] > 0 && topWrong[0] === 'omission') {
      insight = '你目前較容易漏掉字母，短時間內再次回想會比較有效。';
    } else if (wrongShu.length >= 5) {
      insight = '錯詞正在形成自己的學習地圖，優先處理反覆出錯的詞會更有效。';
    } else if (accuracy >= 0.85) {
      insight = '目前回想表現穩定，可以逐步增加新的詞與更長的語境。';
    } else {
      insight = '目前仍在建立穩定回想能力，先把已學詞記牢，再擴大範圍。';
    }
  }

  return {
    vocabulary: ciku,
    recall,
    spelling,
    persistence,
    mastery: clamp(mastery * 100),
    studied,
    wrongCount: wrongShu.length,
    attempts: jiyi.attempts,
    accuracy: clamp(accuracy * 100),
    insight,
    available: jiyi.attempts > 0 || studied > 0
  };
}
