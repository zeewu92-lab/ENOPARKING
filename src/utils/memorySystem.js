const KEY = 'engnocrazy:memory:v1';

const INTERVALS = [
  10 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000
];

function now() {
  return Date.now();
}

function keyFor(word) {
  if (!word) return '';
  return String(word.id || word.word || word.w || '').trim().toLowerCase();
}

function emptyRecord() {
  return {
    level: 0,
    intervalIndex: 0,
    dueAt: 0,
    streak: 0,
    attempts: 0,
    correct: 0,
    wrong: 0,
    assisted: 0,
    lastResult: '',
    lastAttemptAt: 0,
    errorTypes: {
      omission: 0,
      extraLetter: 0,
      transposition: 0,
      spelling: 0
    }
  };
}

function loadAll() {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function saveAll(records) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records));
  } catch {}
}

export function huoquJiyiRecord(word) {
  const key = keyFor(word);
  if (!key) return emptyRecord();
  const records = loadAll();
  const saved = records[key];
  return {
    ...emptyRecord(),
    ...(saved || {}),
    errorTypes: {
      ...emptyRecord().errorTypes,
      ...((saved && saved.errorTypes) || {})
    }
  };
}

export function huoquJiyiSummary(word) {
  const record = huoquJiyiRecord(word);
  const currentTime = now();
  const due = record.dueAt > 0 && record.dueAt <= currentTime;
  return {
    ...record,
    due,
    isNew: record.attempts === 0,
    memoryLevel: record.level
  };
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function compact(value) {
  return normalize(value).replace(/[\\s…⋯.\-']/g, '');
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = current[j];
  }
  return prev[b.length];
}

export function classifySpellingCuowu(answer, target) {
  const a = compact(answer);
  const t = compact(target);
  const result = { omission: 0, extraLetter: 0, transposition: 0, spelling: 0 };

  if (!a || !t || a === t) return result;

  if (a.length + 1 === t.length) {
    for (let i = 0; i < t.length; i += 1) {
      if (a.slice(0, i) + a.slice(i + 1) === t) {
        result.omission = 1;
        return result;
      }
    }
  }

  if (a.length === t.length + 1) {
    for (let i = 0; i < a.length; i += 1) {
      if (a.slice(0, i) + a.slice(i + 1) === t) {
        result.extraLetter = 1;
        return result;
      }
    }
  }

  if (a.length === t.length) {
    for (let i = 0; i < a.length - 1; i += 1) {
      if (
        a[i] !== t[i] &&
        a[i + 1] === t[i] &&
        a[i] === t[i + 1] &&
        a.slice(0, i) + a.slice(i + 2) === t.slice(0, i) + t.slice(i + 2)
      ) {
        result.transposition = 1;
        return result;
      }
    }
  }

  if (levenshtein(a, t) <= Math.max(2, Math.ceil(t.length * 0.2))) {
    result.spelling = 1;
  } else {
    result.spelling = 1;
  }
  return result;
}

export function jiluJiyiAttempt(word, {
  answer = '',
  target = '',
  correct = false,
  assisted = false,
  revealed = false
} = {}) {
  const key = keyFor(word);
  if (!key || typeof window === 'undefined') return huoquJiyiRecord(word);

  const records = loadAll();
  const current = {
    ...emptyRecord(),
    ...(records[key] || {}),
    errorTypes: {
      ...emptyRecord().errorTypes,
      ...((records[key] && records[key].errorTypes) || {})
    }
  };

  current.attempts += 1;
  current.lastAttemptAt = now();

  if (revealed) {
    current.assisted += 1;
    current.lastResult = 'revealed';
    current.dueAt = Math.min(current.dueAt || Infinity, now() + 10 * 60 * 1000);
  } else if (correct) {
    current.correct += 1;
    current.streak += 1;
    current.lastResult = assisted ? 'assisted-correct' : 'correct';

    if (assisted) {
      current.assisted += 1;
      current.level = Math.max(0, current.level - 1);
      current.intervalIndex = 0;
      current.dueAt = now() + INTERVALS[0];
    } else {
      current.level = Math.min(INTERVALS.length, current.level + 1);
      current.intervalIndex = Math.min(INTERVALS.length - 1, current.intervalIndex + 1);
      current.dueAt = now() + INTERVALS[current.intervalIndex];
    }
  } else {
    current.wrong += 1;
    current.streak = 0;
    current.lastResult = 'wrong';
    current.level = Math.max(0, current.level - 1);
    current.intervalIndex = 0;
    current.dueAt = now() + INTERVALS[0];

    const errors = classifySpellingCuowu(answer, target);
    Object.keys(errors).forEach(type => {
      current.errorTypes[type] += errors[type];
    });
  }

  records[key] = current;
  saveAll(records);
  return current;
}

export function orderDanciListForReview(wordList) {
  if (!Array.isArray(wordList) || wordList.length < 2) return wordList || [];

  const currentTime = now();
  const decorated = wordList.map((word, index) => {
    const record = huoquJiyiRecord(word);
    const due = record.attempts > 0 && record.dueAt > 0 && record.dueAt <= currentTime;
    const fresh = record.attempts === 0;
    const urgency = due ? currentTime - record.dueAt : 0;

    let hash = 0;
    const key = keyFor(word);
    for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;

    return { word, index, due, fresh, urgency, hash };
  });

  return decorated
    .sort((a, b) => {
      if (a.due !== b.due) return a.due ? -1 : 1;
      if (a.due && b.due && a.urgency !== b.urgency) return b.urgency - a.urgency;
      if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
      if (a.hash !== b.hash) return a.hash - b.hash;
      return a.index - b.index;
    })
    .map(item => item.word);
}

export function huoquJiyiIntervals() {
  return [...INTERVALS];
}
