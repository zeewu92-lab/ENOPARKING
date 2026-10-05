const PREFIX = 'engnocrazy:';

// 这里先把这一步处理好，后面的逻辑就顺了。
function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function goujianBendiYunduanState() {
  const localStorageState = {};
  if (typeof window !== 'undefined') {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        localStorageState[key] = window.localStorage.getItem(key);
      }
    }
  }

  return {
    version: 1,
    localStorage: localStorageState,
    rememberedWords: safeJson(localStorageState[PREFIX + 'deepMemory'], []) || [],
    ignoredWords: safeJson(localStorageState[PREFIX + 'ignoredWords'], []) || [],
    wrongBook: safeJson(localStorageState[PREFIX + 'wrongBook'], []) || [],
    learningStats: safeJson(localStorageState[PREFIX + 'learningStats'], {}) || {},
    studyDates: safeJson(localStorageState[PREFIX + 'learningStats'], {})?.studyDates || [],
    completedStages: safeJson(localStorageState[PREFIX + 'learningStats'], {})?.completedStages || [],
    memoryRecords: safeJson(localStorageState[PREFIX + 'memory:v1'], {}) || {},
    wrongEvents: safeJson(localStorageState[PREFIX + 'wrongEventsQueue'], []) || [],
    updatedAt: new Date().toISOString()
  };
}

export function applyYunduanState(state) {
  if (typeof window === 'undefined' || !state || typeof state !== 'object') return false;
  const values = state.localStorage && typeof state.localStorage === 'object'
    ? state.localStorage
    : {};

  Object.entries(values).forEach(([key, value]) => {
    if (!key.startsWith(PREFIX)) return;
    if (typeof value !== 'string') return;
    try { window.localStorage.setItem(key, value); } catch {}
  });

  return true;
}

export function mergeBendiAndYunduan(localState, cloudState) {
  const base = cloudState && typeof cloudState === 'object' ? cloudState : {};
  const incoming = localState && typeof localState === 'object' ? localState : {};
  const merged = {
    ...base,
    ...incoming,
    localStorage: {
      ...(base.localStorage || {}),
      ...(incoming.localStorage || {})
    }
  };

  const localHoneyAdminVersion = Number(incoming.localStorage?.[PREFIX + 'honeyAdminVersion'] || 0);
  const remoteHoneyAdminVersion = Number(base.localStorage?.[PREFIX + 'honeyAdminVersion'] || 0);
  if (remoteHoneyAdminVersion > localHoneyAdminVersion) {
    merged.localStorage[PREFIX + 'honey'] = String(base.localStorage?.[PREFIX + 'honey'] || '0');
    merged.localStorage[PREFIX + 'honeyAdminVersion'] = String(remoteHoneyAdminVersion);
  }

  merged.rememberedWords = [...new Set([
    ...(base.rememberedWords || []),
    ...(incoming.rememberedWords || [])
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];

  merged.ignoredWords = mergeItemList(base.ignoredWords, incoming.ignoredWords, 'word');
  merged.wrongBook = mergeItemList(base.wrongBook, incoming.wrongBook, 'word');
  merged.studyDates = [...new Set([
    ...(base.studyDates || []),
    ...(incoming.studyDates || [])
  ])].sort();
  merged.completedStages = mergeItemList(base.completedStages, incoming.completedStages, 'key');
  merged.learningStats = mergeStats(base.learningStats || {}, incoming.learningStats || {});
  merged.memoryRecords = mergeMemoryRecords(base.memoryRecords || {}, incoming.memoryRecords || {});

  merged.localStorage[PREFIX + 'memory:v1'] = JSON.stringify(merged.memoryRecords);
  merged.localStorage[PREFIX + 'deepMemory'] = JSON.stringify(merged.rememberedWords);
  merged.localStorage[PREFIX + 'ignoredWords'] = JSON.stringify(merged.ignoredWords);
  merged.localStorage[PREFIX + 'wrongBook'] = JSON.stringify(merged.wrongBook);
  merged.localStorage[PREFIX + 'learningStats'] = JSON.stringify(merged.learningStats);

  return merged;
}

function mergeItemList(a, b, key) {
  const map = new Map();
  [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(item => {
    if (!item || !item[key]) return;
    const id = String(item[key]).trim().toLowerCase();
    const old = map.get(id);
    if (!old) {
      map.set(id, item);
      return;
    }
    map.set(id, {
      ...old,
      ...item,
      wrongCount: Math.max(Number(old.wrongCount || 0), Number(item.wrongCount || 0)),
      errorTypes: {
        ...(old.errorTypes || {}),
        ...(item.errorTypes || {})
      }
    });
  });
  return [...map.values()];
}

function mergeStats(a, b) {
  const out = { ...a, ...b };
  for (const key of ['totalWords','earlyBird','nightStudy','bonusUses']) {
    out[key] = Math.max(Number(a[key] || 0), Number(b[key] || 0));
  }

  out.studyDates = [...new Set([
    ...(a.studyDates || []),
    ...(b.studyDates || [])
  ])].map(value => String(value || '').slice(0, 10)).filter(Boolean).sort();

  out.studyDays = out.studyDates.length;
  const streakInfo = calculateStreaks(out.studyDates);
  out.streak = streakInfo.streak;
  out.longestStreak = Math.max(
    Number(a.longestStreak || 0),
    Number(b.longestStreak || 0),
    streakInfo.longest
  );

  out.completedStages = mergeItemList(a.completedStages, b.completedStages, 'key');

  const latestStudyDate = out.studyDates[out.studyDates.length - 1] || '';
  out.lastStudyDate = latestStudyDate;
  if (String(a.lastGoalDate || '') > String(b.lastGoalDate || '')) out.lastGoalDate = a.lastGoalDate;
  else out.lastGoalDate = b.lastGoalDate || a.lastGoalDate || '';

  out.goalStreak = Math.max(Number(a.goalStreak || 0), Number(b.goalStreak || 0));
  out.longestGoalStreak = Math.max(Number(a.longestGoalStreak || 0), Number(b.longestGoalStreak || 0));
  return out;
}

function dateToNumber(value) {
  const match = String(value || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function calculateStreaks(dates) {
  const values = [...new Set(dates.map(value => String(value || '').slice(0, 10)).filter(Boolean))]
    .map(value => ({ value, time: dateToNumber(value) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);

  if (!values.length) return { streak: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i].time - values[i - 1].time === 86400000) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
  }

  const latest = values[values.length - 1];
  const today = new Date();
  const todayTime = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayTime = todayTime - 86400000;
  const latestIsActive = latest.time === todayTime || latest.time === yesterdayTime;

  let current = 1;
  if (latestIsActive) {
    for (let i = values.length - 2; i >= 0; i -= 1) {
      if (values[i + 1].time - values[i].time === 86400000) current += 1;
      else break;
    }
  } else {
    current = 0;
  }

  return { streak: current, longest };
}

export function qingchuCuowuEventQueue() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(PREFIX + 'wrongEventsQueue'); } catch {}
}

function mergeMemoryRecords(a, b) {
  const out = { ...(a || {}) };
  Object.entries(b || {}).forEach(([key, incoming]) => {
    const base = out[key] || {};
    const merged = { ...base, ...incoming };
    for (const field of ['level','intervalIndex','streak','attempts','correct','wrong','assisted']) {
      merged[field] = Math.max(Number(base[field] || 0), Number(incoming[field] || 0));
    }
    merged.lastAttemptAt = Math.max(Number(base.lastAttemptAt || 0), Number(incoming.lastAttemptAt || 0));
    merged.dueAt = Math.max(Number(base.dueAt || 0), Number(incoming.dueAt || 0));
    merged.errorTypes = {
      ...(base.errorTypes || {}),
      ...(incoming.errorTypes || {})
    };
    Object.keys(merged.errorTypes).forEach(type => {
      merged.errorTypes[type] = Math.max(Number(base.errorTypes?.[type] || 0), Number(incoming.errorTypes?.[type] || 0));
    });
    out[key] = merged;
  });
  return out;
}
