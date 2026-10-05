const KEY = 'engnocrazy:deepMemory';

function read() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function write(itemList) {
  try { window.localStorage.setItem(KEY, JSON.stringify(itemList)); } catch {}
  return itemList;
}

export function huoquDeepJiyi() { return read(); }

export function shezhiDeepJiyi(word, remembered = true) {
  const key = String(word || '').trim().toLowerCase();
  if (!key) return read();
  const itemList = read().filter(item => item !== key);
  if (remembered) itemList.push(key);
  return write(itemList);
}

export function yichuDeepJiyiDanciList(wordList = []) {
  const removedSet = new Set(
    (Array.isArray(wordList) ? wordList : [])
      .map(word => String(word?.word || word?.w || word || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!removedSet.size) return read();
  return write(read().filter(item => !removedSet.has(String(item).trim().toLowerCase())));
}

export function isDeepJiyi(word) {
  const key = String(word || '').trim().toLowerCase();
  return read().includes(key);
}
