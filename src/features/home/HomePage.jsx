import { huoquXuexiTongji } from '../../utils/learningStats.js';

export default function HomePage({ wordCount, goal, onStart, onSetup }) {
  const stats = huoquXuexiTongji();
  const today = Math.min(goal, Number(stats.todayWords) || 0);
  const complete = today >= goal && goal > 0;

  return (
    <main className="v2-page v2-home">
      <section className="v2-hero">
        <p className="v2-eyebrow">今日学习</p>
        <div className="v2-goal-number">{today}<span> / {goal}</span></div>
        <h1>{complete ? '今日目标已完成' : '把今天的进度种下来'}</h1>
        <p className="v2-muted">当前词库 {wordCount} 个单词。每完成一个有效学习流程，就会产生一颗种子。</p>
        <div className="v2-actions">
          <button className="v2-primary" onClick={onStart}>{complete ? '继续学习' : '开始学习'}</button>
          <button className="v2-secondary" onClick={onSetup}>调整词库与目标</button>
        </div>
      </section>

      <section className="v2-stats">
        <article><b>{stats.totalWords}</b><span>累计学习</span></article>
        <article><b>{stats.studyDays}</b><span>学习天数</span></article>
        <article><b>{stats.streak}</b><span>连续天数</span></article>
      </section>
    </main>
  );
}
