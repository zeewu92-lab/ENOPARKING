/**
 * 島嶼宿主適配層（Island Host）。
 *
 * 島嶼只透過這個介面讀寫產品資料，不直接碰學習算法：
 *   Learning Event → Algorithm → Seed Ledger →（收取）→ Garden State → Island
 * 遵守 architecture-baseline 的 Garden 隔離原則：這裡只「消費」種子與花園狀態，
 * 不修改 Scheduler / Mastery / Stability / Learning Event。
 *
 * 經濟完全沿用現有規則：
 *   - 花瓣（petals，介面名稱見 CURRENCY_NAME）是貨幣，商店消費只減花瓣，不減樹成長值
 *   - 樹成長值 tree.growth 只由「收取種子」增加，島嶼等級 = 樹階段 + 1
 */
import {
  GARDEN_TUNING,
  applyHarvestToGarden,
  getGardenState,
  saveGardenState
} from '../../utils/gardenState.js';
import { getSeedLedger, settleSeeds } from '../../utils/seedLedger.js';
import { storage } from '../../utils/storage.js';

export const CURRENCY_NAME = '詞露';          // 想改回「花蜜」只需改這一行
export const DECOR_KEY = 'islandDecor';        // 實際 key 為 engnocrazy:islandDecor，會跟著雲端同步一起走
export const ISLAND_EVENT = 'engnocrazy:island-changed';

const MAX_GROWTH = GARDEN_TUNING.stageThresholds[GARDEN_TUNING.stageThresholds.length - 1];

function readDecorState() {
  const saved = storage.getJSON(DECOR_KEY, null);
  const decor = Array.isArray(saved?.decor)
    ? saved.decor
        .filter(item => item && item.type && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.z)))
        .map(item => ({ id: Number(item.id), type: String(item.type), x: Number(item.x), z: Number(item.z), rot: Number(item.rot) || 0 }))
    : [];
  const maxId = decor.reduce((max, item) => Math.max(max, item.id || 0), 0);
  return { version: 1, decor, nextId: Math.max(Number(saved?.nextId) || 1, maxId + 1) };
}

function writeDecorState(state) {
  storage.setJSON(DECOR_KEY, state);
}

function notify() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(ISLAND_EVENT));
  }
}

export function createIslandHost() {
  return {
    currencyName: CURRENCY_NAME,

    /* ---- 貨幣 ---- */
    getTokens() {
      return Math.max(0, Number(getGardenState().petals) || 0);
    },
    spend(amount) {
      const cost = Math.max(0, Math.floor(Number(amount) || 0));
      const state = getGardenState();
      if ((Number(state.petals) || 0) < cost) return false;
      state.petals = state.petals - cost;           // 只扣花瓣；tree.growth 與 nectarHistory 不動
      saveGardenState(state);
      notify();
      return true;
    },
    refund(amount) {
      const value = Math.max(0, Math.floor(Number(amount) || 0));
      if (!value) return;
      const state = getGardenState();
      state.petals = (Number(state.petals) || 0) + value;
      saveGardenState(state);
      notify();
    },

    /* ---- 樹 / 等級 ---- */
    getGrowthInfo() {
      const state = getGardenState();
      const growth = Math.max(0, Number(state.tree?.growth) || 0);
      const stage = Number(state.tree?.stage) || 0;
      const thresholds = GARDEN_TUNING.stageThresholds;
      return {
        growth,
        stage,
        level: stage + 1,
        progress: Math.min(1, growth / MAX_GROWTH),            // 供樹的外觀使用，0..1
        stageFrom: thresholds[Math.min(stage, thresholds.length - 1)],
        stageTo: stage >= thresholds.length - 1 ? null : thresholds[stage + 1]
      };
    },

    /* ---- 種子 / 收取（與 GardenPage 相同規則：每日上限 dailyHarvestCap）---- */
    getHarvestInfo() {
      const state = getGardenState();
      const ledger = getSeedLedger();
      const harvestedToday = Number(state.dailyGarden?.harvestedToday) || 0;
      const remaining = Math.max(0, GARDEN_TUNING.dailyHarvestCap - harvestedToday);
      return { pending: ledger.pendingSeeds, remainingToday: remaining, harvestable: Math.min(ledger.pendingSeeds, remaining) };
    },
    harvest() {
      const { harvestable } = this.getHarvestInfo();
      if (!harvestable) return 0;
      const result = settleSeeds(harvestable);
      const count = result.settled.length;
      if (count) applyHarvestToGarden(count);
      notify();
      return count;
    },

    /* ---- 裝飾 ---- */
    getDecor() {
      return readDecorState().decor;
    },
    addDecor({ type, x, z, rot = 0 }) {
      const state = readDecorState();
      const item = { id: state.nextId, type: String(type), x: Number(x), z: Number(z), rot: Number(rot) || 0 };
      state.decor.push(item);
      state.nextId += 1;
      writeDecorState(state);
      notify();
      return item;
    },
    updateDecor(id, patch) {
      const state = readDecorState();
      const item = state.decor.find(entry => entry.id === Number(id));
      if (!item) return null;
      Object.assign(item, patch);
      writeDecorState(state);
      notify();
      return item;
    },
    removeDecor(id) {
      const state = readDecorState();
      const before = state.decor.length;
      state.decor = state.decor.filter(entry => entry.id !== Number(id));
      if (state.decor.length === before) return false;
      writeDecorState(state);
      notify();
      return true;
    },

    /* ---- 訂閱 ---- */
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener(ISLAND_EVENT, listener);
      return () => window.removeEventListener(ISLAND_EVENT, listener);
    }
  };
}
