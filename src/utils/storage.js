const PREFIX = 'engnocrazy:';

const safe = (fn, fallback = null) => {
  try { return fn(); } catch { return fallback; }
};

export const storage = {
  get: (key) => safe(() => window.localStorage.getItem(PREFIX + key)),
  set: (key, value) => safe(() => window.localStorage.setItem(PREFIX + key, value)),
  remove: (key) => safe(() => window.localStorage.removeItem(PREFIX + key)),
  getJSON: (key, fallback = null) => safe(() => {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  }, fallback),
  setJSON: (key, value) => safe(() => window.localStorage.setItem(PREFIX + key, JSON.stringify(value)))
};
