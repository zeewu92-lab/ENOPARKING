import { useCallback, useState } from 'react';
import { getGardenState, applyHarvestToGarden, 花园_TUNING } from '../../utils/gardenState.js';
import { getSeedLedger, settleSeeds } from '../../utils/seedLedger.js';

export default function GardenPage({ onBack }) {
  const [, setTick] = useState(0);
  const state = getGardenState();
  const ledger = getSeedLedger();
  const harvested = Number(state.dailyGarden?.harvestedToday) || 0;
  const remaining = Math.max(0, 花园_TUNING.dailyHarvestCap - harvested);
  const count = Math.min(ledger.pendingSeeds, remaining);
  const stage = Number(state.tree?.stage) || 0;

  const harvest = useCallback(() => {
    if (!count) return;
    const result = settleSeeds(count);
    const settledCount = result.settled.length;
    if (settledCount) applyHarvestToGarden(settledCount);
    setTick(value => value + 1);
  }, [count]);

  return (
    <main className="v2-page v2-garden">
      <header className="v2-section-head">
        <button className="v2-text-button" onClick={onBack}>‹ 返回</button>
        <div><p className="v2-eyebrow">花园</p><h1>语未央花园</h1></div>
      </header>

      <section className="v2-garden-scene">
        <div className={`v2-tree stage-${stage}`} aria-hidden="true">🌱</div>
        <div className="v2-garden-stage">成长阶段 {stage}</div>
        <div className="v2-growth"><span style={{ width: `${Math.min(100, state.tree.growth / 2)}%` }} /></div>
        <p>{state.tree.growth} 成长值 · {state.petals} 花瓣</p>
      </section>

      <section className="v2-garden-ledger">
        <div><b>{ledger.pendingSeeds}</b><span>待收种子</span></div>
        <div><b>{ledger.settledSeeds.length}</b><span>已入花园</span></div>
        <div><b>{remaining}</b><span>今日可收</span></div>
      </section>

      <button className="v2-primary v2-wide" disabled={!count} onClick={harvest}>
        {count ? `收取 ${count} 颗种子` : '目前没有可收取的种子'}
      </button>

      <p className="v2-muted v2-small">花园只消费已完成的学习事件，不修改学习算法、Scheduler、Mastery 或 Stability。</p>
    </main>
  );
}
