const MEMORY_KEY = 'engnocrazy:memory';

function chuangjianDefaultState() {
  return {
    status: 'learning',
    correctStreak: 0,
    wrongCount: 0,
    errorTypes: {},
    lastAttemptAt: null,
    nextReviewAt: null,
  };
}

export function huoquJiyiState() {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function huoquDanciJiyi(word) {
  const all = huoquJiyiState();
  return all[word] || chuangjianDefaultState();
}

export function gengxinJiyiState(word, patch) {
  if (typeof window === 'undefined' || !word) return chuangjianDefaultState();

  const all = huoquJiyiState();
  const current = all[word] || chuangjianDefaultState();
  const updated = { ...current, ...patch };

  try {
    all[word] = updated;
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(all));
  } catch {}

  return updated;
}

export function jiluJiyiAttempt(word, result) {
  const current = huoquDanciJiyi(word);
  const now = new Date().toISOString();

  if (result?.isCorrect) {
    const assisted = Boolean(result?.assisted);
    return gengxinJiyiState(word, {
      status: assisted ? 'learning' : 'learning',
      correctStreak: assisted ? 0 : current.correctStreak + 1,
      lastAttemptAt: now,
      nextReviewAt: assisted ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : current.nextReviewAt,
    });
  }

  const errorType = result?.errorType || 'spelling_error';
  const errorTypes = {
    ...current.errorTypes,
    [errorType]: (current.errorTypes?.[errorType] || 0) + 1,
  };

  return gengxinJiyiState(word, {
    status: 'learning',
    correctStreak: 0,
    wrongCount: current.wrongCount + 1,
    errorTypes,
    lastAttemptAt: now,
    nextReviewAt: current.nextReviewAt,
  });
}
