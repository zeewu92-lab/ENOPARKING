import { useState } from 'react';
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
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
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthDays = new Date(year, month + 1, 0).getDate();
  const calendarCells = [...Array(monthStart.getDay()).fill(null), ...Array.from({ length: monthDays }, (_, index) => index + 1)];
  const studyDates = new Set(Array.isArray(stats.studyDates) ? stats.studyDates : []);
  const now = new Date();
  const todayKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  return (
    <main className="v2-page v2-home">
      <header className="home-topline">
        <button className="home-user-heading" onClick={onProfile} aria-label="打开个人资料"><span className="home-user-avatar">{avatarText}</span><span className="home-user-greeting">{greeting}，</span><span className="home-user-name">{username}</span></button>
        <div className="home-top-actions">
          <button className="home-nectar" onClick={onGarden} aria-label="查看花蜜"><span aria-hidden="true">✦</span><span>花蜜</span><strong>{nectar}</strong></button>
          <button className="home-calendar-pill" onClick={() => setCalendarOpen(true)} aria-haspopup="dialog" aria-expanded={calendarOpen}>种花日历 <span aria-hidden="true">›</span></button>
        </div>
      </header>

      <section className={`home-learning ${complete ? 'is-complete' : ''}`} aria-labelledby="home-learning-title">
        <div className="home-section-line">
          <div><p className="v2-eyebrow">TODAY</p><h2 id="home-learning-title">今日学习</h2></div>
        </div>
        <div className="home-progress-row" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
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
        </div>
        <div className="home-learning-foot"><button onClick={onSetup}>调整每日计划 <span aria-hidden="true">›</span></button><span>{complete ? '今天的努力已经开花' : `还差 ${remaining} 个单词达标`}</span></div>
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

      {calendarOpen && (
        <div className="flower-calendar-backdrop" onClick={() => setCalendarOpen(false)}>
          <section className="flower-calendar-dialog" role="dialog" aria-modal="true" aria-label="种花日历" onClick={event => event.stopPropagation()}>
            <header className="flower-calendar-header">
              <div><p className="v2-eyebrow">MY LEARNING</p><h2>种花日历</h2><p>每一次学习，都值得留下记号。</p></div>
              <button className="flower-calendar-close" onClick={() => setCalendarOpen(false)} aria-label="关闭日历">×</button>
            </header>
            <div className="flower-calendar-month">
              <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} aria-label="上个月">‹</button>
              <strong>{year}年 {month + 1}月</strong>
              <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} aria-label="下个月">›</button>
            </div>
            <div className="flower-calendar-grid flower-calendar-weekdays">{['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day}>{day}</span>)}</div>
            <div className="flower-calendar-grid flower-calendar-days">
              {calendarCells.map((day, index) => {
                if (!day) return <span className="flower-calendar-empty" key={'empty-' + index} />;
                const dateKey = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                const learned = studyDates.has(dateKey);
                return <span key={dateKey} className={'flower-calendar-day' + (learned ? ' is-learned' : '') + (dateKey === todayKey ? ' is-today' : '')} title={learned ? '这一天完成过学习' : undefined}><span>{day}</span>{learned && <i aria-label="完成学习">✿</i>}</span>;
              })}
            </div>
            <footer className="flower-calendar-footer"><span><i>✿</i> 已完成学习</span><strong>连续学习 {stats.streak} 天</strong></footer>
          </section>
        </div>
      )}
    </main>
  );
}
