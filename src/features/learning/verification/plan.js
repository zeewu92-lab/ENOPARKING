/**
 * 产品层 Verification Plan 生成器。
 *
 * 职责：
 * - 根据学习来源、Scheduler 状态、上次 Unit 结果和 selector 排名生成 Plan。
 *
 * 不负责：
 * - 读取 Event Log。
 * - 计算 cooldown。
 * - 更新 scores。
 * - 写入状态。
 * - 判断 Unit 是否完成。
 *
 * Plan 创建后应作为 Unit 的固定快照使用。
 */

const INTENSITY_MAP = Object.freeze({
  初识: 'Unstable',
  模糊: 'Weak',
  熟悉: 'Normal',
  掌握: 'Strong',
  稳固: 'Strong',
});

const INTENSITY_ORDER = ['Strong', 'Normal', 'Weak', 'Unstable'];

const PLAN_TEMPLATES = Object.freeze({
  Strong: ['P@0'],
  Normal: ['P@0', 'S@0'],
  Weak: ['P@0', 'P@1'],
  Unstable: ['P@0', 'P@1', 'S@0'],
});

const NEW_PLAN_TEMPLATE = ['meaning@0'];

function weakerOf(a, b) {
  return INTENSITY_ORDER.indexOf(a) >= INTENSITY_ORDER.indexOf(b) ? a : b;
}

function parseToken(token, primary, secondary) {
  const [slot, variantStr] = token.split('@');
  const variantIndex = Number.parseInt(variantStr, 10);
  const dimension = slot === 'P' ? primary : secondary;

  if (!dimension || !Number.isInteger(variantIndex)) {
    throw new Error('无效的 Verification Plan 模板');
  }

  return { dimension, variantIndex };
}

function buildNewActions() {
  return NEW_PLAN_TEMPLATE.map((token, index) => {
    const [dimension, variantStr] = token.split('@');
    return {
      index,
      dimension,
      variantIndex: Number.parseInt(variantStr, 10),
    };
  });
}

export function createVerificationPlan({
  unitId,
  wordId,
  source,
  schedulerState,
  lastResult,
  selectorResult,
  createdAt = Date.now(),
}) {
  if (!unitId || !wordId) {
    throw new Error('unitId 和 wordId 不能为空');
  }

  if (source !== 'new' && source !== 'review') {
    throw new Error('source 必须是 new 或 review');
  }

  const { primary, secondary } = selectorResult || {};

  if (!primary || !secondary) {
    throw new Error('selectorResult 必须提供 primary 和 secondary');
  }

  let intensity = null;
  let actions;

  if (source === 'new') {
    actions = buildNewActions();
  } else {
    intensity = INTENSITY_MAP[schedulerState] || 'Normal';

    if (lastResult === 'wrong' || lastResult === 'weak') {
      intensity = weakerOf(intensity, 'Weak');
    }

    const template = PLAN_TEMPLATES[intensity];
    actions = template.map((token, index) => ({
      index,
      ...parseToken(token, primary, secondary),
    }));
  }

  return Object.freeze({
    id: `vp_${unitId}`,
    unitId,
    wordId,
    source,
    actionCount: actions.length,
    actions: Object.freeze(actions.map(action => Object.freeze(action))),
    createdAt,
  });
}

export const __testing__ = {
  INTENSITY_MAP,
  INTENSITY_ORDER,
  PLAN_TEMPLATES,
  NEW_PLAN_TEMPLATE,
  weakerOf,
  parseToken,
};
