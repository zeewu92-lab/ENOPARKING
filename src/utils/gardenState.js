const KEY = 'engnocrazy:gardenState';

export const GARDEN_TUNING = Object.freeze({
  // 正式第一阶段先固定最小可运作经济值。
  dailyHarvestCap: 20,
  petalsPerSeed: 1,
  growthPerSeed: 1,
  stageThresholds: [0, 20, 50, 100, 200]
});

function todayKey() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

function getTreeStage(growth) {
  const value = Math.max(0, Number(growth) || 0);
  const thresholds = GARDEN_TUNING.stageThresholds;

  if (value >= thresholds[4]) return 4;
  if (value >= thresholds[3]) return 3;
  if (value >= thresholds[2]) return 2;
  if (value >= thresholds[1]) return 1;
  return 0;
}

function defaultState(date = todayKey()) {
  return {
    version: 1,
    dailyGarden: { date, harvestedToday: 0 },
    tree: { growth: 0, stage: 0 },
    petals: 0,
    nectarHistory: {}
  };
}

function readState() {
  if (typeof window === 'undefined') return defaultState();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    const base = defaultState();
    const growth = Math.max(0, Number(parsed?.tree?.growth) || 0);

    const next = {
      ...base,
      ...(parsed || {}),
      dailyGarden: { ...base.dailyGarden, ...(parsed?.dailyGarden || {}) },
      tree: {
        ...base.tree,
        ...(parsed?.tree || {}),
        growth,
        stage: getTreeStage(growth)
      },
      petals: Math.max(0, Number(parsed?.petals) || 0),
      nectarHistory: parsed?.nectarHistory && typeof parsed.nectarHistory === 'object' && !Array.isArray(parsed.nectarHistory) ? parsed.nectarHistory : {}
    };

    if (next.dailyGarden.date !== todayKey()) {
      next.dailyGarden = { date: todayKey(), harvestedToday: 0 };
    }

    return next;
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function getGardenState() {
  return readState();
}

export function saveGardenState(state) {
  const base = defaultState();
  const growth = Math.max(0, Number(state?.tree?.growth) || 0);
  const next = {
    ...base,
    ...state,
    dailyGarden: { ...base.dailyGarden, ...(state?.dailyGarden || {}) },
    tree: {
      ...base.tree,
      ...(state?.tree || {}),
      growth,
      stage: getTreeStage(growth)
    },
    petals: Math.max(0, Number(state?.petals) || 0),
    nectarHistory: state?.nectarHistory && typeof state.nectarHistory === 'object' && !Array.isArray(state.nectarHistory) ? state.nectarHistory : {}
  };

  writeState(next);
  return next;
}

export function applyHarvestToGarden(count, { date = todayKey() } = {}) {
  const state = readState();
  const harvested = Math.max(0, Math.floor(Number(count) || 0));
  if (!harvested) return state;

  const growth = Math.max(0, Number(state.tree.growth) || 0) +
    harvested * GARDEN_TUNING.growthPerSeed;

  state.dailyGarden = {
    date,
    harvestedToday: Math.max(0, Number(state.dailyGarden.harvestedToday) || 0) + harvested
  };
  state.tree = { growth, stage: getTreeStage(growth) };
  state.petals = Math.max(0, Number(state.petals) || 0) +
    harvested * GARDEN_TUNING.petalsPerSeed;
  if (!state.nectarHistory || typeof state.nectarHistory !== 'object' || Array.isArray(state.nectarHistory)) state.nectarHistory = {};
  state.nectarHistory[date] = (Number(state.nectarHistory[date]) || 0) + harvested * GARDEN_TUNING.petalsPerSeed;

  writeState(state);
  return state;
}
