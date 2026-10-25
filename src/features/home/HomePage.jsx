import { lazy, Suspense, useState } from 'react';
import { huoquXuexiTongji } from '../../utils/learningStats.js';
import { getGardenState } from '../../utils/gardenState.js';
import { huoquCuowuShu } from '../../utils/wrongBook.js';
import { CURRENCY_NAME } from '../island/islandHost.js';

// three.js 較大，延遲到首頁出現後才載入，不拖慢首屏
const IslandCard = lazy(() => import('../island/IslandCard.jsx'));

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 11) return '上午好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function HomePage({ user, goal, onStart, onSetup, onGarden, onArchive, onProfile }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const stats = huoquXuexiTongji();
  const garden = getGardenState();
  const wrongWords = huoquCuowuShu();
  const today = Math.max(0, Number(stats.todayWords) || 0);
  const complete = goal > 0 && today >= goal;
  const progress = goal > 0 ? Math.min(100, Math.round(today / goal * 100)) : 0;
  const nectar = Math.max(0, Number(garden.petals) || 0);
  const greeting = getGreeting();
  const username = String(user?.nickname || user?.username || '学习者').trim() || '学习者';
  const avatarText = username.slice(0, 1);
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthDays = new Date(year, month + 1, 0).getDate();
  const calendarCells = [...Array(monthStart.getDay()).fill(null), ...Array.from({ length: monthDays }, (_, index) => index + 1)];
  const dailyCounts = stats.dailyWordCounts && typeof stats.dailyWordCounts === 'object' ? stats.dailyWordCounts : {};
  const studyDates = new Set(Array.isArray(stats.studyDates) ? stats.studyDates : []);
  const gardenNectarHistory = garden.nectarHistory && typeof garden.nectarHistory === 'object' ? garden.nectarHistory : {};
  const now = new Date();
  const todayKey = dateKey(now);
  const hasSelectedCount = Object.prototype.hasOwnProperty.call(dailyCounts, selectedDate) || selectedDate === todayKey;
  const selectedCount = Number(dailyCounts[selectedDate]) || (selectedDate === todayKey ? today : null);
  const hasSelectedNectar = Object.prototype.hasOwnProperty.call(gardenNectarHistory, selectedDate);
  const selectedNectar = Number(gardenNectarHistory[selectedDate]) || 0;
  const monthStudyDates = [...studyDates].filter(date => date.startsWith(year + '-' + String(month + 1).padStart(2, '0')));
  const monthWordCount = monthStudyDates.reduce((sum, date) => sum + (Number(dailyCounts[date]) || (date === todayKey ? today : 0)), 0);
  const selectedIsFuture = selectedDate > todayKey;
  const selectedDateParts = selectedDate.split('-');
  const selectedDateLabel = selectedDateParts[0] + '年' + Number(selectedDateParts[1]) + '月' + Number(selectedDateParts[2]) + '日';

  return (
    <main className="v2-page v2-home">
      <header className="home-topline">
        <button className="home-user-heading" onClick={onProfile} aria-label="打开个人资料"><span className="home-user-avatar">{avatarText}</span><span className="home-user-greeting">{greeting}，</span><span className="home-user-name">{username}</span></button>
        <div className="home-top-actions">
          <button className="home-nectar" onClick={onGarden} aria-label={`查看${CURRENCY_NAME}`}><span aria-hidden="true">✦</span><span>{CURRENCY_NAME}</span><strong>{nectar}</strong></button>
          <button className="home-calendar-pill" onClick={() => setCalendarOpen(true)} aria-haspopup="dialog" aria-expanded={calendarOpen}>种花日历 <span aria-hidden="true">›</span></button>
        </div>
      </header>

      <section className={`home-learning ${complete ? 'is-complete' : ''}`} aria-label="学习进度">
        <button className="home-learning-goal" onClick={onSetup}>目标 {goal} 词 <span aria-hidden="true">›</span></button>
        <div className="home-progress-count">{Math.max(0, goal - today)}<span> 待浇灌</span></div>
        <div className="home-progress-track-wrap">
          <div className="home-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-label="学习进度"><span style={{ width: `${progress}%` }} /></div>
          <span className="home-progress-endpoint">{Math.min(today, goal)}/{goal}</span>
        </div>
        <div className="home-learning-actions">
          <button className="v2-primary home-start-button" onClick={onStart}>{today > 0 ? '继续学习' : '开始学习'} <span aria-hidden="true">›</span></button>
          <button className="home-review-button" onClick={onStart}><span aria-hidden="true">↻</span> 复习</button>
        </div>
      </section>

      <button className="home-challenge-strip" onClick={onArchive} aria-label={`错词挑战，${wrongWords.length} 个待攻克`}>
        <span className="home-challenge-copy"><strong>错词挑战 <i aria-hidden="true">·</i> {wrongWords.length} 个待攻克</strong></span>
        <span className="home-challenge-action" aria-hidden="true">›</span>
      </button>

      <Suspense fallback={<div aria-hidden="true" style={{ height: 'min(88vw, 380px)', marginTop: 16, borderRadius: 22, background: 'linear-gradient(#cfe4dc, #a9c58f)' }} />}>
        <IslandCard />
      </Suspense>

      <footer className="home-footer"><span>语未央，词无尽。</span><button onClick={onArchive}>学习档案 <span aria-hidden="true">›</span></button></footer>

      {calendarOpen && (
        <div className="flower-calendar-backdrop" onClick={() => setCalendarOpen(false)}>
          <section className="flower-calendar-dialog" role="dialog" aria-modal="true" aria-label="种花日历" onClick={event => event.stopPropagation()}>
            <header className="flower-calendar-header">
              <div><p className="v2-eyebrow">MY LEARNING</p><h2>种花日历</h2><p>学习记录会在这里慢慢开花。</p></div>
              <button className="flower-calendar-close" onClick={() => setCalendarOpen(false)} aria-label="关闭日历">×</button>
            </header>
            <div className="flower-calendar-month">
              <button onClick={() => { const next = new Date(year, month - 1, 1); setCalendarMonth(next); setSelectedDate(dateKey(next)); }} aria-label="上个月">‹</button>
              <strong>{year}年 {month + 1}月</strong>
              <button onClick={() => { const next = new Date(year, month + 1, 1); setCalendarMonth(next); setSelectedDate(dateKey(next)); }} aria-label="下个月">›</button>
            </div>
            <div className="flower-calendar-grid flower-calendar-weekdays">{['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day}>{day}</span>)}</div>
            <div className="flower-calendar-grid flower-calendar-days">
              {calendarCells.map((day, index) => {
                if (!day) return <span className="flower-calendar-empty" key={'empty-' + index} />;
                const date = new Date(year, month, day);
                const dateValue = dateKey(date);
                const isFuture = dateValue > todayKey;
                const count = Number(dailyCounts[dateValue]) || (dateValue === todayKey ? today : studyDates.has(dateValue) ? 1 : 0);
                const flower = count >= 6 ? '✿' : count >= 3 ? '❀' : count > 0 ? '🌱' : '';
                const intensity = count >= 6 ? ' is-bloom' : count >= 3 ? ' is-bud' : count > 0 ? ' is-sprout' : '';
                return <button type="button" key={dateValue} disabled={isFuture} onClick={() => setSelectedDate(dateValue)} className={'flower-calendar-day' + intensity + (dateValue === todayKey ? ' is-today' : '') + (dateValue === selectedDate ? ' is-selected' : '') + (isFuture ? ' is-future' : '')} title={count ? `学习 ${count} 个单词` : isFuture ? '未来日期' : '暂无学习记录'}><span>{day}</span>{flower && <i aria-hidden="true">{flower}</i>}</button>;
              })}
            </div>
            <section className="flower-calendar-detail" aria-live="polite">
              <div><strong>{selectedDateLabel}</strong><span>{selectedIsFuture ? '还没到这一天' : selectedCount ? '有学习记录' : '暂无学习记录'}</span></div>
              <div className="flower-calendar-detail-stats"><span><b>{hasSelectedCount ? selectedCount : studyDates.has(selectedDate) ? '有' : 0}</b> {hasSelectedCount ? '个单词' : studyDates.has(selectedDate) ? '学习记录' : '个单词'}</span><span><b>{hasSelectedNectar ? selectedNectar : '—'}</b> {hasSelectedNectar ? CURRENCY_NAME : CURRENCY_NAME + '未记录'}</span></div>
            </section>
            <div className="flower-calendar-legend"><span><i className="legend-sprout">🌱</i> 1–2 个</span><span><i className="legend-bud">❀</i> 3–5 个</span><span><i className="legend-bloom">✿</i> 6 个以上</span></div>
            <footer className="flower-calendar-footer">
              <span>本月学习 <b>{monthStudyDates.length}</b> 天 · 可统计 <b>{monthWordCount}</b> 词</span>
              <strong>最长连续 {stats.longestStreak || 0} 天</strong>
            </footer>
            {(stats.streak >= 30 || stats.longestStreak >= 30) && <p className="flower-calendar-milestone">✦ 已达成连续学习 30 天里程碑</p>}
            {stats.streak >= 7 && stats.streak < 30 && <p className="flower-calendar-milestone">✦ 已连续学习 {stats.streak} 天，继续保持</p>}
            {stats.streak < 7 && stats.longestStreak >= 7 && stats.longestStreak < 30 && <p className="flower-calendar-milestone">✦ 已达成连续学习 7 天里程碑</p>}
          </section>
        </div>
      )}
    </main>
  );
}
