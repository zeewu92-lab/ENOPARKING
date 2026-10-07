/**
 * 学习单元结果处理器。
 *
 * Unit 层负责把多个 Action 汇总成一次稳定的 Unit Outcome。
 * Event 仍然是事实记录，UnitOutcome 只负责本次 Unit 的结算。
 */

import {
  DIMENSION_SETS,
  penaltyFor,
  STABILITY_BANDS,
} from '../../../shared/learning/constants.js';
import { applyVerificationToScores } from '../../../shared/learning/verificationScores.js';
import { MasteryCalculator } from '../../../simulator/MasteryCalculator.js';

const RESULT_VALUES = Object.freeze(['correct', 'weak', 'wrong']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeStability(stability) {
  const value = Number(stability);
  if (!Number.isFinite(value)) return 0.5;
  return clamp(value, 0, 1);
}

function stabilityBandIndex(stability) {
  const value = normalizeStability(stability);
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let index = 0; index < STABILITY_BANDS.length; index += 1) {
    const distance = Math.abs(STABILITY_BANDS[index] - value);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }

  return bestIndex;
}

function normalizeActions(actionSummary) {
  const actions = actionSummary?.actions;

  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('UnitOutcomeProcessor: actionSummary.actions 不能为空');
  }

  return actions.map((action, index) => {
    const verification = String(action?.verification || '').trim();

    if (!DIMENSION_SETS[verification]) {
      throw new Error(
        'UnitOutcomeProcessor: 未知的 verification "' +
        verification +
        '"'
      );
    }

    if (!RESULT_VALUES.includes(action?.result)) {
      throw new Error(
        'UnitOutcomeProcessor: Action #' +
        (index + 1) +
        ' 的 result 无效'
      );
    }

    return {
      index,
      verification,
      result: action.result,
    };
  });
}

function applyActions(scores, actions, startStability) {
  let nextScores = { ...scores };
  const changes = [];
  const errorMultiplier = 1 - 0.5 * normalizeStability(startStability);

  for (const action of actions) {
    const updated = applyVerificationToScores({
      scores: nextScores,
      verification: action.verification,
      result: action.result,
      dimensions: DIMENSION_SETS[action.verification],
      errorMultiplier,
    });

    nextScores = updated.scores;
    changes.push({
      ...action,
      dimensions: DIMENSION_SETS[action.verification],
      changes: updated.changed,
    });
  }

  return { scores: nextScores, changes };
}

function updateCorrectStability(stabilityState, correctActionCount) {
  const current = normalizeStability(stabilityState?.stability);
  const progress = Math.max(0, Number(stabilityState?.progress) || 0);
  const currentIndex = stabilityBandIndex(current);
  const required = Number(stabilityState?.requiredRecovery) || 0;

  // 暂行 Unit 规则：每个正确 Action 提供 1 点恢复证据，
  // 只在 Unit 结束时结算一次，最多跨越一个稳定度区间。
  if (correctActionCount <= 0) {
    return {
      stability: current,
      progress,
      requiredRecovery: required,
      transitions: 0,
    };
  }

  if (currentIndex >= STABILITY_BANDS.length - 1) {
    return {
      stability: current,
      progress: 0,
      requiredRecovery: 0,
      transitions: 0,
    };
  }

  const targetRequired = Number.isFinite(required) && required > 0
    ? required
    : 1;
  const nextProgress = progress + correctActionCount;

  if (nextProgress < targetRequired) {
    return {
      stability: current,
      progress: nextProgress,
      requiredRecovery: targetRequired,
      transitions: 0,
    };
  }

  const nextStability = STABILITY_BANDS[currentIndex + 1];

  return {
    stability: nextStability,
    progress: Math.min(nextProgress - targetRequired, 1),
    requiredRecovery: 1,
    transitions: 1,
  };
}

function updateWrongStability(stabilityState) {
  const currentIndex = stabilityBandIndex(stabilityState?.stability);
  const nextIndex = Math.max(0, currentIndex - 1);
  const nextStability = STABILITY_BANDS[nextIndex];

  return {
    stability: nextStability,
    progress: 0,
    requiredRecovery: nextIndex < STABILITY_BANDS.length - 1 ? 1 : 0,
    transitions: currentIndex === nextIndex ? 0 : -1,
  };
}

function buildErrorEpisode(actions, stabilityAtStart) {
  const dimensions = [
    ...new Set(
      actions
        .filter(action => action.result === 'wrong')
        .flatMap(action => DIMENSION_SETS[action.verification])
    ),
  ].sort();

  if (dimensions.length === 0) return null;

  return {
    count: 1,
    dimensions,
    stabilityAtStart: normalizeStability(stabilityAtStart),
  };
}

export function processUnitOutcome({
  unitOutcome,
  currentState,
}) {
  const result = unitOutcome?.result;

  if (!RESULT_VALUES.includes(result)) {
    throw new Error(
      'UnitOutcomeProcessor: result 只能是 correct、weak 或 wrong'
    );
  }

  if (result === 'weak') {
    throw new Error(
      'UnitOutcomeProcessor: weak 暂未定义稳定度与 Mastery 数学契约'
    );
  }

  const actions = normalizeActions(unitOutcome.actionSummary);
  const startScores = { ...(currentState?.scores || {}) };
  const startStability = currentState?.stability || {};
  const updated = applyActions(startScores, actions, startStability.stability);
  const mastery = new MasteryCalculator().calculate(updated.scores);

  const correctActionCount = actions.filter(
    action => action.result === 'correct'
  ).length;

  const nextStability = result === 'correct'
    ? updateCorrectStability(startStability, correctActionCount)
    : updateWrongStability(startStability);

  return {
    result,
    scores: updated.scores,
    stability: nextStability,
    mastery,
    lastResult: result,
    actionChanges: updated.changes,
    errorEpisode: result === 'wrong'
      ? buildErrorEpisode(actions, startStability.stability)
      : null,
  };
}

export const __testing__ = {
  normalizeActions,
  applyActions,
  updateCorrectStability,
  updateWrongStability,
  buildErrorEpisode,
  penaltyFor,
};
