const WRONG_BOOK_KEY = 'engnocrazy:wrongBook';

// 这里先把这一步处理好，后面的逻辑就顺了。
function read() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(WRONG_BOOK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(itemList) {
  try { window.localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(itemList)); } catch {}
  return itemList;
}

export function huoquCuowuShu() { return read().filter(item => (Number(item.wrongCount) || 0) > 0); }

// 这里整理错误状态，先记录当前结果，再交给后续复习流程。
export function jiluCuowuDanci(word, errorType = 'spelling_error') {
  if (typeof window === 'undefined' || !word) return read();

  const source = typeof word === 'object' ? word : { word };
  const rawWord = source.word || source.w || '';
  const key = String(rawWord).trim().toLowerCase();
  if (!key) return read();

  const itemList = read();
  const index = itemList.findIndex(item => item.word === key);
  const now = new Date().toISOString();
  const metadata = {
    meaning: source.meaning || source.m || '',
    phonetic: source.phonetic || source.p || '',
    example: source.example || source.e || '',
    exampleCn: source.exampleCn || source.c || '',
    textbookId: source.textbookId || '',
    unitId: source.unitId || '',
    unitName: source.unitName || ''
  };

  try {
    const queueKey = 'engnocrazy:wrongEventsQueue';
    const queue = JSON.parse(window.localStorage.getItem(queueKey) || '[]');
    queue.push({ word: key, errorType, at: now });
    window.localStorage.setItem(queueKey, JSON.stringify(queue.slice(-200)));
  } catch {}

  if (index >= 0) {
    const item = itemList[index];
    const errorTypes = { ...(item.errorTypes || {}), [errorType]: (item.errorTypes?.[errorType] || 0) + 1 };
    itemList[index] = {
      ...item,
      ...metadata,
      wrongCount: (item.wrongCount || 0) + 1,
      errorTypes,
      lastErrorType: errorType,
      lastAt: now
    };
  } else {
    itemList.unshift({
      word: key,
      ...metadata,
      wrongCount: 1,
      errorTypes: { [errorType]: 1 },
      lastErrorType: errorType,
      lastAt: now
    });
  }
  return write(itemList);
}

export function qingchuCuowuShuDanci(word) {
  const key = String(word || '').trim().toLowerCase();
  return write(read().filter(item => item.word !== key));
}

const IGNORED_KEY = 'engnocrazy:ignoredWords';
function readIgnored() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(IGNORED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeIgnored(itemList) {
  try { window.localStorage.setItem(IGNORED_KEY, JSON.stringify(itemList)); } catch {}
  return itemList;
}
export function qingchuIgnoredDanciList(wordList = []) {
  const removedSet = new Set(
    (Array.isArray(wordList) ? wordList : [])
      .map(word => String(word?.word || word?.w || word || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!removedSet.size) return readIgnored();
  return writeIgnored(readIgnored().filter(item => !removedSet.has(String(item.word || '').trim().toLowerCase())));
}

export function huoquIgnoredDanciList() {
  const ignored = readIgnored();
  const legacy = read().filter(item => (Number(item.skipCount) || 0) > 0).map(item => ({
    word: item.word,
    ignoredAt: item.lastAt || new Date().toISOString(),
    reason: 'legacy_skip'
  }));
  const merged = [...ignored];
  legacy.forEach(item => { if (!merged.some(existing => existing.word === item.word)) merged.push(item); });
  return merged;
}
export function ignoreDanci(word, reason = 'user_ignore') {
  if (typeof window === 'undefined' || !word) return readIgnored();
  const key = String(word).trim().toLowerCase();
  const itemList = readIgnored().filter(item => item.word !== key);
  itemList.unshift({ word: key, ignoredAt: new Date().toISOString(), reason });
  return writeIgnored(itemList);
}
export function restoreIgnoredDanci(word) {
  const key = String(word || '').trim().toLowerCase();
  return writeIgnored(readIgnored().filter(item => item.word !== key));
}
