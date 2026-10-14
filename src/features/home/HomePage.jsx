import { useMemo } from 'react';
import { huoquXuexiTongji } from '../../utils/learningStats.js';
import { getGardenState } from '../../utils/gardenState.js';
import { getSeedLedger } from '../../utils/seedLedger.js';

function formatDate() {
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

export default function HomePage({ wordCount, goal, onStart, onSetup, onGarden, onArchive, onProfile }) {
  const stats = huoquXuexiTongji();
  const garden = getGardenState();
  const seeds = getSeedLedger();
  const today = Math.min(goal, Number(stats.todayWords) || 0);
  const complete = goal > 0 && today >= goal;
  const remaining = Math.max(0, goal - today);
  const progress = goal > 0 ? Math.min(100, Math.round(today / goal * 100)) : 0;
  const watered = Math.min(50, Math.max(0, Number(garden.tree?.growth) || 0));
  const nectar = Math.max(0, Number(garden.petals) || 0);
  const greeting = useMemo(() => complete ? '今天的花開了' : `今天還有 ${remaining} 個詞等你澆灌`, [complete, remaining]);

  return (
    <main className="v2-page v2-home">
      <header className="home-topline">
        <a className="home-wordmark" href="/" aria-label="語未央首頁"><span className="home-mark" aria-hidden="true">✿</span><span>語未央</span></a>
        <div className="home-top-actions">
          <button className="home-nectar" onClick={onGarden} aria-label="查看花蜜"><span aria-hidden="true">✦</span><span>花蜜</span><strong>{nectar}</strong></button>
          <button className="home-profile-link" onClick={onProfile} aria-label="個人設定"><span className="home-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.3"/><path d="M5.5 20c.6-3.4 2.8-5.1 6.5-5.1s5.9 1.7 6.5 5.1"/></svg></span></button>
        </div>
      </header>

      <section className="home-welcome">
        <div className="home-welcome-line"><p className="home-date">{formatDate()}</p><span className="home-greeting">{complete ? '今日目標已達成' : '慢慢來，持續就好'}</span></div>
        <h1>{greeting}</h1>
        <p className="home-intro">記住一個單詞，就讓花園多一點生機。</p>
      </section>

      <section className={`home-learning ${complete ? 'is-complete' : ''}`} aria-labelledby="home-learning-title">
        <div className="home-section-line">
          <div><p className="v2-eyebrow">TODAY</p><h2 id="home-learning-title">今日學習</h2></div>
          <button className="home-calendar-pill" onClick={onArchive}>種花日曆 <span aria-hidden="true">›</span></button>
        </div>
        <div className="home-progress-row">
          <div className="home-progress-copy">
            <p className="home-progress-label">{complete ? '本日目標' : '待澆灌'}</p>
            <div className="home-progress-count">{complete ? '完成' : remaining}<span>{complete ? ' ✓' : ' 個單詞'}</span></div>
            <div className="home-progress-meta"><span>已學 {today} / {goal}</span><span>詞庫 {wordCount} 個</span></div>
            <div className="home-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${progress}%` }} /></div>
            <div className="home-learning-actions">
              <button className="v2-primary home-start-button" onClick={complete ? onGarden : onStart}>{complete ? '今日完成 ✓' : '開始學習'} <span aria-hidden="true">›</span></button>
              <button className="home-review-button" onClick={onStart}><span aria-hidden="true">↻</span> 複習</button>
            </div>
          </div>
          <button className="home-growth-visual" onClick={onGarden} aria-label="進入花園，查看植物成長">
            <div className="home-sun" /><div className="home-hill home-hill-back" /><div className="home-hill home-hill-front" />
            <div className={`home-sprout stage-${Math.min(4, Number(garden.tree?.stage) || 0)}`}><span /><i /><b /><em>✿</em></div>
            <span className="home-growth-label">{Math.min(100, Number(garden.tree?.growth) || 0)} 成長值</span>
          </button>
        </div>
        <div className="home-learning-foot"><button onClick={onSetup}>調整每日計畫 <span aria-hidden="true">›</span></button><span>{complete ? '今天的努力已經開花' : `還差 ${remaining} 個單詞達標`}</span></div>
      </section>

      <section className="home-quick-actions" aria-label="學習捷徑">
        <button onClick={onStart}><span className="home-quick-icon review-icon" aria-hidden="true">↻</span><span><strong>待複習</strong><small>回顧學過的單詞</small></span><b aria-hidden="true">›</b></button>
        <button onClick={onArchive}><span className="home-quick-icon error-icon" aria-hidden="true">●</span><span><strong>錯詞挑戰</strong><small>重新練習易錯單詞</small></span><b aria-hidden="true">›</b></button>
        <button onClick={onSetup}><span className="home-quick-icon task-icon" aria-hidden="true">✓</span><span><strong>今日任務</strong><small>{complete ? '今日目標已完成' : `完成 ${remaining} 個單詞`}</small></span><b aria-hidden="true">›</b></button>
      </section>

      <section className="home-statistics" aria-label="學習記錄">
        <div><span className="home-stat-icon" aria-hidden="true">⌁</span><p>連續學習</p><strong>{stats.streak}</strong><small>天</small></div>
        <div><span className="home-stat-icon" aria-hidden="true">✳</span><p>累計單詞</p><strong>{stats.totalWords}</strong><small>個</small></div>
      </section>

      <button className="home-garden-entry" onClick={onGarden}>
        <div className="home-garden-scene" aria-hidden="true">
          <div className="garden-cloud cloud-one" /><div className="garden-cloud cloud-two" /><div className="garden-sun" />
          <div className="garden-ground ground-back" /><div className="garden-ground ground-front" />
          <div className="garden-flower flower-one"><i /><b>✿</b></div><div className="garden-flower flower-two"><i /><b>✿</b></div><div className="garden-flower flower-three"><i /><b>✿</b></div>
          <span className="garden-butterfly">✧</span>
        </div>
        <div className="home-garden-info"><p className="v2-eyebrow">MY GARDEN</p><h2>我的花園 <span aria-hidden="true">›</span></h2><p>已澆灌 <strong>{watered}/50</strong> 詞</p><small>{seeds.pendingSeeds} 顆種子待收取 · 花瓣 {garden.petals}</small></div>
      </button>

      <footer className="home-footer"><span>語未央，詞無盡。</span><button onClick={onArchive}>學習檔案 <span aria-hidden="true">›</span></button></footer>
    </main>
  );
}
