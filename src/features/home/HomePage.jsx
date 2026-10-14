import { huoquXuexiTongji } from '../../utils/learningStats.js';
import { getGardenState } from '../../utils/gardenState.js';
import { getSeedLedger } from '../../utils/seedLedger.js';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 9) return '早上好';
  if (hour < 11) return '上午好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function HomePage({ user, wordCount, goal, onStart, onSetup, onGarden, onArchive, onProfile }) {
  const stats = huoquXuexiTongji();
  const garden = getGardenState();
  const seeds = getSeedLedger();
  const today = Math.min(goal, Number(stats.todayWords) || 0);
  const complete = goal > 0 && today >= goal;
  const remaining = Math.max(0, goal - today);
  const progress = goal > 0 ? Math.min(100, Math.round(today / goal * 100)) : 0;
  const watered = Math.min(50, Math.max(0, Number(garden.tree?.growth) || 0));
  const nectar = Math.max(0, Number(garden.petals) || 0);
  const greeting = getGreeting();
  const username = String(user?.nickname || user?.username || '学习者').trim() || '学习者';
  const avatarText = username.slice(0, 1);

  return (
    <main className="v2-page v2-home">
      <header className="home-topline">
        <button className="home-user-heading" onClick={onProfile} aria-label="打开个人资料"><span className="home-user-avatar">{avatarText}</span><span className="home-user-greeting">{greeting}，</span><span className="home-user-name">{username}</span></button>
        <div className="home-top-actions">
          <button className="home-nectar" onClick={onGarden} aria-label="查看花蜜"><span aria-hidden="true">✦</span><span>花蜜</span><strong>{nectar}</strong></button>
          
        </div>
      </header>

      <section className={`home-learning ${complete ? 'is-complete' : ''}`} aria-labelledby="home-learning-title">
        <div className="home-section-line">
          <div><p className="v2-eyebrow">TODAY</p><h2 id="home-learning-title">今日学习</h2></div>
          <button className="home-calendar-pill" onClick={onArchive}>种花日历 <span aria-hidden="true">›</span></button>
        </div>
        <div className="home-progress-row">
          <div className="home-progress-copy">
            <p className="home-progress-label">{complete ? '本日目标' : '待浇灌'}</p>
            <div className="home-progress-count">{complete ? '完成' : remaining}<span>{complete ? ' ✓' : ' 个单词'}</span></div>
            <div className="home-progress-meta"><span>已学 {today} / {goal}</span><span>词库 {wordCount} 个</span></div>
            <div className="home-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${progress}%` }} /></div>
            <div className="home-learning-actions">
              <button className="v2-primary home-start-button" onClick={complete ? onGarden : onStart}>{complete ? '今日完成 ✓' : '开始学习'} <span aria-hidden="true">›</span></button>
              <button className="home-review-button" onClick={onStart}><span aria-hidden="true">↻</span> 复习</button>
            </div>
          </div>
          <button className="home-growth-visual" onClick={onGarden} aria-label="进入花园，查看植物成长">
            <div className="home-sun" /><div className="home-hill home-hill-back" /><div className="home-hill home-hill-front" />
            <div className={`home-sprout stage-${Math.min(4, Number(garden.tree?.stage) || 0)}`}><span /><i /><b /><em>✿</em></div>
            <span className="home-growth-label">{Math.min(100, Number(garden.tree?.growth) || 0)} 成长值</span>
          </button>
        </div>
        <div className="home-learning-foot"><button onClick={onSetup}>调整每日计划 <span aria-hidden="true">›</span></button><span>{complete ? '今天的努力已经开花' : `还差 ${remaining} 个单词达标`}</span></div>
      </section>

      <section className="home-quick-actions" aria-label="学习捷径">
        <button onClick={onStart}><span className="home-quick-icon review-icon" aria-hidden="true">↻</span><span><strong>待复习</strong><small>回顾学过的单词</small></span><b aria-hidden="true">›</b></button>
        <button onClick={onArchive}><span className="home-quick-icon error-icon" aria-hidden="true">●</span><span><strong>错词挑战</strong><small>重新练习易错单词</small></span><b aria-hidden="true">›</b></button>
        <button onClick={onSetup}><span className="home-quick-icon task-icon" aria-hidden="true">✓</span><span><strong>今日任务</strong><small>{complete ? '今日目标已完成' : `完成 ${remaining} 个单词`}</small></span><b aria-hidden="true">›</b></button>
      </section>

      <section className="home-statistics" aria-label="学习记錄">
        <div><span className="home-stat-icon" aria-hidden="true">⌁</span><p>连续学习</p><strong>{stats.streak}</strong><small>天</small></div>
        <div><span className="home-stat-icon" aria-hidden="true">✳</span><p>累计单词</p><strong>{stats.totalWords}</strong><small>个</small></div>
      </section>

      <button className="home-garden-entry" onClick={onGarden}>
        <div className="home-garden-scene" aria-hidden="true">
          <div className="garden-cloud cloud-one" /><div className="garden-cloud cloud-two" /><div className="garden-sun" />
          <div className="garden-ground ground-back" /><div className="garden-ground ground-front" />
          <div className="garden-flower flower-one"><i /><b>✿</b></div><div className="garden-flower flower-two"><i /><b>✿</b></div><div className="garden-flower flower-three"><i /><b>✿</b></div>
          <span className="garden-butterfly">✧</span>
        </div>
        <div className="home-garden-info"><p className="v2-eyebrow">MY GARDEN</p><h2>我的花园 <span aria-hidden="true">›</span></h2><p>已浇灌 <strong>{watered}/50</strong> 词</p><small>{seeds.pendingSeeds} 颗种子待收取 · 花瓣 {garden.petals}</small></div>
      </button>

      <footer className="home-footer"><span>语未央，词无尽。</span><button onClick={onArchive}>学习档案 <span aria-hidden="true">›</span></button></footer>
    </main>
  );
}
