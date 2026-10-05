const KEY = 'engnocrazy:seedLedger';

function todayKey() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

function readState() {
  if (typeof window === 'undefined') {
    return { version: 1, seeds: [], settledSeeds: [] };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return {
      version: 1,
      seeds: Array.isArray(parsed?.seeds) ? parsed.seeds : [],
      settledSeeds: Array.isArray(parsed?.settledSeeds) ? parsed.settledSeeds : []
    };
  } catch {
    return { version: 1, seeds: [], settledSeeds: [] };
  }
}

function writeState(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

function normalizeWordId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function lifecycleKey(wordId, lifecycle = 'basic') {
  return normalizeWordId(wordId) + ':' + String(lifecycle || 'basic');
}

export function getSeedLedger() {
  const state = readState();
  return {
    ...state,
    pendingSeeds: state.seeds.length
  };
}

export function recordLearningSeed({ wordId, day = todayKey(), source = 'learning', lifecycle = 'basic' } = {}) {
  const normalizedWordId = normalizeWordId(wordId);
  if (!normalizedWordId) return { added: false, reason: 'missing-word-id', ...getSeedLedger() };

  const state = readState();
  const key = lifecycleKey(normalizedWordId, lifecycle);
  const exists = state.seeds.some(seed => seed.key === key) ||
    state.settledSeeds.some(seed => seed.key === key);

  if (exists) {
    return { added: false, reason: 'already-seeded', ...getSeedLedger() };
  }

  const seed = {
    seedId: 'seed_' + normalizedWordId + '_' + String(day),
    key,
    wordId: normalizedWordId,
    lifecycle: String(lifecycle || 'basic'),
    source: String(source || 'learning'),
    earnedAt: String(day || todayKey())
  };

  state.seeds.push(seed);
  writeState(state);

  return { added: true, seed, ...getSeedLedger() };
}

export function settleSeeds(limit, { date = todayKey() } = {}) {
  const state = readState();
  const cap = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 0;
  if (cap <= 0 || state.seeds.length === 0) {
    return { settled: [], ...getSeedLedger() };
  }

  const settled = state.seeds.slice(0, cap).map(seed => ({
    ...seed,
    settledAt: date
  }));

  state.seeds = state.seeds.slice(settled.length);
  state.settledSeeds = state.settledSeeds.concat(settled);
  writeState(state);

  return { settled, ...getSeedLedger() };
}

export function resetSeedLedgerForTest() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(KEY); } catch {}
}
