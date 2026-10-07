/**
 * Unit Result 压缩规则。
 *
 * 职责：
 * - 给定一组已完成的 Action，返回 Unit 结果。
 *
 * 不做：
 * - 更新 scores / stability / mastery
 * - 读写 Event Log
 * - 调用 Scheduler
 * - 决定 actionCount
 *
 * 纯函数：相同输入始终得到相同输出。
 */

/**
 * @param {Array<{verification?: string, result: 'correct' | 'wrong'}>} actions
 * @returns {'correct' | 'weak' | 'wrong'}
 */
export function computeUnitResult(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('computeUnitResult: actions 必须为非空数组');
  }

  for (const action of actions) {
    if (action?.result !== 'correct' && action?.result !== 'wrong') {
      throw new Error(
        `computeUnitResult: 无效的 action.result "${action?.result}"，只接受 'correct' | 'wrong'`
      );
    }
  }

  const allCorrect = actions.every(action => action.result === 'correct');
  const lastCorrect = actions[actions.length - 1].result === 'correct';

  if (allCorrect) return 'correct';
  if (lastCorrect) return 'weak';
  return 'wrong';
}
