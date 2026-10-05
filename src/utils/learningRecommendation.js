const MODE_IDS = ['normal', 'long', 'short', 'frequency', 'confusable'];

export const LEARNING_MODE_META = {
  normal: {
    name: '常規',
    cta: '開始常規學習',
    reason: '今天先按照目前詞庫穩定推進，維持學習節奏。'
  },
  long: {
    name: '長詞突破',
    cta: '開始長詞突破',
    reason: '近期長詞特徵較明顯，今天集中攻克它們，讓記憶更紮實。'
  },
  short: {
    name: '短詞速記',
    cta: '開始短詞速記',
    reason: '短詞適合快速建立熟練度，今天先用較輕的節奏累積。'
  },
  frequency: {
    name: '高頻衝刺',
    cta: '開始高頻衝刺',
    reason: '目前詞庫裡的高頻詞值得優先處理，今天集中衝刺核心詞。'
  },
  confusable: {
    name: '形近辨析',
    cta: '開始形近辨析',
    reason: '近期拼寫錯誤比較集中，今天先處理容易混淆的單詞。'
  }
};

function wordText(item) {
  return String(item?.word || item?.w || '').trim();
}

function letterCount(item) {
  return wordText(item).match(/[A-Za-z]/g)?.length || 0;
}

export function jisuanZuijiaMoshi({
  words = [],
  stats = {},
  wrongBook = [],
  lastMode = '',
  randomValue = 0.5,
  frequencyAvailable = true
} = {}) {
  const source = Array.isArray(words) ? words : [];
  const wrongBookData = Array.isArray(wrongBook) ? wrongBook : [];
  const total = Math.max(1, source.length);
  const longRatio = source.filter(item => letterCount(item) >= 5).length / total;
  const duanRatio = source.filter(item => letterCount(item) <= 5 && letterCount(item) > 0).length / total;
  const highKaopinRatio = source.filter(item => Number(item?.examFrequency || item?.frequency || 0) > 0).length / total;
  const longWordErrors = wrongBookData.filter(item => letterCount(item) >= 5).reduce((sum, item) => sum + Number(item?.wrongCount || 0), 0);
  const shortWordErrors = wrongBookData.filter(item => letterCount(item) > 0 && letterCount(item) <= 5).reduce((sum, item) => sum + Number(item?.wrongCount || 0), 0);
  const totalErrors = wrongBookData.reduce((sum, item) => sum + Number(item?.wrongCount || 0), 0);
  const spellingErrors = wrongBookData.reduce((sum, item) => sum + Number(item?.errorTypes?.spelling || 0) + Number(item?.errorTypes?.transposition || 0) + Number(item?.errorTypes?.omission || 0), 0);
  const streak = Number(stats?.streak || 0);
  const todayWordCount = Number(stats?.todayWords || 0);

  const scores = {
    normal: 34 + Math.min(16, streak * 2) + Math.min(10, todayWordCount),
    long: 28 + longRatio * 28 + Math.min(24, longWordErrors * 3),
    short: 26 + duanRatio * 18 + Math.min(24, shortWordErrors * 3),
    frequency: frequencyAvailable ? 30 + highKaopinRatio * 30 + Math.min(18, totalErrors * 1.5) : -Infinity,
    confusable: 24 + Math.min(36, spellingErrors * 4) + Math.min(20, totalErrors * 2)
  };

  MODE_IDS.forEach(mode => {
    if (mode === lastMode) scores[mode] += 40;
  });

  const jitter = Math.max(0, Math.min(1, Number(randomValue) || 0)) * 6;
  const ranked = MODE_IDS
    .map(mode => ({ mode, score: scores[mode] + jitter * (mode.charCodeAt(0) % 5) / 4 }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || { mode: 'normal', score: 40 };
  const second = ranked[1] || { score: 0 };
  const confidence = Math.round(Math.max(78, Math.min(97, 84 + (best.score - second.score) * 0.45)));

  const reasons = [];
  if (best.mode === 'long' && (longRatio > 0.35 || longWordErrors > 0)) reasons.push('近期長詞錯誤率偏高');
  if (best.mode === 'short' && (duanRatio > 0.45 || shortWordErrors > 0)) reasons.push('短詞較適合今天快速累積');
  if (best.mode === 'frequency' && frequencyAvailable) reasons.push('目前詞庫含有較多高頻核心詞');
  if (best.mode === 'confusable' && spellingErrors > 0) reasons.push('近期拼寫錯誤比較集中');
  if (best.mode === 'normal') reasons.push(streak >= 3 ? '連續學習節奏穩定' : '今天適合維持穩定節奏');
  if (!reasons.length) reasons.push(LEARNING_MODE_META[best.mode].reason);

  return {
    mode: best.mode,
    score: best.score,
    confidence,
    reasons,
    label: LEARNING_MODE_META[best.mode].name,
    cta: LEARNING_MODE_META[best.mode].cta
  };
}

export function huoquXuexiMoshiMeta(mode) {
  return LEARNING_MODE_META[MODE_IDS.includes(mode) ? mode : 'normal'];
}
