/**
 * 共享学习分数计算。
 *
 * 这里只处理 verification 对 scores 的直接影响。
 * 不处理稳定度、错误 Episode、Evidence、Mastery 或 Scheduler。
 */

import {
  MASTERY_GAINS,
  DIMENSION_SETS,
  penaltyFor,
} from './constants.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundHalfUp(value) {
  return Math.floor(value + 0.5);
}

export function applyVerificationToScores({
  scores,
  verification,
  result,
  errorMultiplier = 1,
  dimensions,
}) {
  if (result === 'correct') {
    return applyCorrect({ scores, verification });
  }

  if (result === 'wrong') {
    return applyWrong({
      scores,
      verification,
      dimensions,
      errorMultiplier,
    });
  }

  throw new Error(
    'applyVerificationToScores: 无效的 result "' +
    result +
    '"，只接受 correct 或 wrong'
  );
}

function applyCorrect({ scores, verification }) {
  const gains = MASTERY_GAINS[verification];

  if (!gains) {
    throw new Error(
      'applyVerificationToScores: 未知的 verification "' +
      verification +
      '"'
    );
  }

  const next = { ...scores };
  const changed = [];

  for (const [dimension, delta] of Object.entries(gains)) {
    const before = next[dimension];
    const actualDelta = roundHalfUp(delta);
    const after = clamp(before + actualDelta, 0, 100);

    next[dimension] = after;
    changed.push({
      dimension,
      before,
      delta: actualDelta,
      after,
    });
  }

  return { scores: next, changed };
}

function applyWrong({
  scores,
  verification,
  dimensions,
  errorMultiplier,
}) {
  if (errorMultiplier < 0 || errorMultiplier > 1) {
    console.warn(
      '[verificationScores] 异常 errorMultiplier: ' +
      errorMultiplier +
      '。正常值域为 [0, 1]，将按原数学计算。'
    );
  }

  const targetDimensions = dimensions ?? DIMENSION_SETS[verification];

  if (!targetDimensions) {
    throw new Error(
      'applyVerificationToScores: 未知的 verification "' +
      verification +
      '"'
    );
  }

  const next = { ...scores };
  const changed = [];

  for (const dimension of targetDimensions) {
    const before = next[dimension];
    const basePenalty = penaltyFor(before);
    const adjustedPenalty = basePenalty * errorMultiplier;
    const after = Math.max(0, roundHalfUp(before - adjustedPenalty));

    next[dimension] = after;
    changed.push({
      dimension,
      before,
      basePenalty,
      adjustedPenalty,
      after,
    });
  }

  return { scores: next, changed };
}
