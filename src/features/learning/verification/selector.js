/**
 * 产品层验证维度选择器。
 *
 * 职责：
 * - 根据当前分数和事件历史排列四个验证维度。
 * - 冷却期只降低维度优先级，不排除维度。
 *
 * 不负责：
 * - 决定 Action 数量。
 * - 生成 Retrieval Context。
 * - 写入状态。
 * - 读取或修改 Scheduler。
 * - 修改 scores。
 */

export const VERIFICATION_DIMENSIONS = {
  choice: ['meaning'],
  spelling: ['spelling'],
  dictation: ['spelling', 'listening'],
  usage: ['usage'],
};

export const ALL_DIMENSIONS = ['meaning', 'spelling', 'listening', 'usage'];

const DEFAULT_CONFIG = Object.freeze({
  dimensionCooldownDays: 2,
});

function getLastVerifiedDay(eventHistory, dimension) {
  let latest = null;

  for (const event of eventHistory) {
    const dimensions = VERIFICATION_DIMENSIONS[event.verification];
    if (!dimensions || !dimensions.includes(dimension)) continue;

    const day = Number(event.day);
    if (!Number.isFinite(day)) continue;

    if (latest === null || day > latest) {
      latest = day;
    }
  }

  return latest;
}

function isInCooldown(lastVerifiedDay, currentDay, cooldownDays) {
  if (lastVerifiedDay === null) return false;
  return lastVerifiedDay + cooldownDays > currentDay;
}

export function selectDimensions({
  wordId,
  scores,
  eventHistory,
  currentDay,
  config = {},
}) {
  void wordId;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const day = Number(currentDay);

  if (!Number.isFinite(day)) {
    throw new Error('currentDay 必须是有效的 epoch day');
  }

  const enriched = ALL_DIMENSIONS.map(dimension => {
    const lastVerifiedDay = getLastVerifiedDay(eventHistory, dimension);
    const inCooldown = isInCooldown(
      lastVerifiedDay,
      day,
      Number(cfg.dimensionCooldownDays)
    );

    return {
      dimension,
      score: Number(scores?.[dimension]) || 0,
      lastVerifiedDay,
      inCooldown,
    };
  });

  enriched.sort((a, b) => {
    if (a.inCooldown !== b.inCooldown) {
      return a.inCooldown ? 1 : -1;
    }

    if (a.score !== b.score) {
      return a.score - b.score;
    }

    const aDay = a.lastVerifiedDay ?? -Infinity;
    const bDay = b.lastVerifiedDay ?? -Infinity;
    if (aDay !== bDay) {
      return aDay - bDay;
    }

    return a.dimension.localeCompare(b.dimension);
  });

  return {
    ranking: enriched,
    primary: enriched[0].dimension,
    secondary: enriched[1].dimension,
  };
}

export const __testing__ = {
  VERIFICATION_DIMENSIONS,
  ALL_DIMENSIONS,
  getLastVerifiedDay,
  isInCooldown,
};
