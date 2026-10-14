import { huoquXuexiTongji } from '../../utils/learningStats.js';

function formatDate() {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

export default function HomePage({ wordCount, goal, onStart, onSetup, onGarden, onArchive, onProfile }) {
  const stats = huoquXuexiTongji();
  const today = Math.min(goal, Number(stats.todayWords) || 0);
  const complete = today >= goal && goal > 0;
  const progress = goal > 0 ? Math.min(100, Math.round(today / goal * 100)) : 0;

  return (
    <main className="v2-page v2-home">
      <header className="home-topline">
        <a className="home-wordmark" href="/" aria-label="语未央首页"><span className="home-mark">✿</span><span>语未央</span></a>
        <button className="home-profile-link" onClick={onProfile} aria-label="个人设置"><span className="home-avatar">{'园'}</span></button>
      </header>

      <section className="home-welcome">
        <p className="home-date">{formatDate()}</p>
        <h1>让今天的词语，<br /><em>慢慢生长。</em></h1>
        <p className="home-intro">不必着急。记住一个单词，也是在向前。</p>
      </section>

      <section className="home-learning" aria-labelledby="home-learning-title">
        <div className="home-section-line">
          <div>
            <p className="v2-eyebrow">TODAY'S LEARNING</p>
            <h2 id="home-learning-title">今日学习</h2>
          </div>
          <button className="home-calendar-pill" onClick={onArchive}><span aria-hidden="true">◷</span> 种花日历 <span aria-hidden="true">↗</span></button>
        </div>

        <div className="home-progress-row">
          <div className="home-progress-copy">
            <p className="home-progress-label">{complete ? '今天的目标已经完成' : '今天，向前一点点'}</p>
            <div className="home-progress-count">{today}<span> / {goal} 个</span></div>
            <p className="home-progress-note">已完成今日目标的 {progress}%</p>
            <button className="v2-primary home-start-button" onClick={onStart}>{complete ? '继续学习' : '开始学习'} <span aria-hidden="true">↗</span></button>
          </div>
          <div className="home-growth-visual" aria-label={`今日学习进度 ${progress}%`}>
            <div className="home-sun"></div>
            <div className="home-hill home-hill-back"></div>
            <div className="home-hill home-hill-front"></div>
            <div className="home-sprout"><span></span><i></i><b></b></div>
            <div className="home-progress-ring" style={{'--progress': `${progress * 3.6}deg`}}><span>{progress}<small>%</small></span></div>
          </div>
        </div>
        <div className="home-progress-track"><span style={{width: `${progress}%`}}></span></div>
        <div className="home-learning-foot"><span>当前词库 · {wordCount} 个单词</span><button onClick={onSetup}>调整计划 <span aria-hidden="true">→</span></button></div>
      </section>

      <section className="home-statistics" aria-label="学习记录">
        <div><span className="home-stat-icon">✳</span><p>累计学习</p><strong>{stats.totalWords}</strong><small>个单词</small></div>
        <div><span className="home-stat-icon">☼</span><p>坚持学习</p><strong>{stats.studyDays}</strong><small>天</small></div>
        <div><span className="home-stat-icon">⌁</span><p>连续学习</p><strong>{stats.streak}</strong><small>天</small></div>
      </section>

      <section className="home-garden-entry">
        <div className="home-garden-art" aria-hidden="true"><span>✿</span><i></i><b></b></div>
        <div className="home-garden-copy"><p className="v2-eyebrow">YOUR LITTLE GARDEN</p><h2>每一次记住，<br />都让花园更丰盛。</h2><p>去看看今天种下的成长。</p></div>
        <button className="home-garden-open" onClick={onGarden} aria-label="进入花园">↗</button>
      </section>

      <footer className="home-footer"><span>语未央，词无尽。</span><button onClick={onArchive}>学习档案 <span aria-hidden="true">→</span></button></footer>
    </main>
  );
}
