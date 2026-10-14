import { useEffect, useState } from 'react';
import { storage } from '../../utils/storage.js';
import { huoquXuexiTongji } from '../../utils/learningStats.js';

export default function ProfilePage({ user, onGoalChange, onLogout }) {
  const stats = huoquXuexiTongji();
  const [goal, setGoal] = useState(() => Number(localStorage.getItem('engnocrazy:dailyGoal')) || 10);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const value = Math.max(5, Math.min(100, Number(goal) || 10));
    localStorage.setItem('engnocrazy:dailyGoal', String(value));
    onGoalChange?.(value);
  }, [goal, onGoalChange]);

  return (
    <main className="v2-page">
      <header className="v2-section-head">
        <div><p className="v2-eyebrow">个人资料</p><h1>我的</h1></div>
      </header>

      <section className="v2-profile">
        <div className="v2-avatar">{String(user?.nickname || user?.username || '语').slice(0, 1)}</div>
        <div><h2>{user?.nickname || '语未央学习者'}</h2><p>{user?.username || ''}</p></div>
      </section>

      <section className="v2-list profile-learning-total" aria-label="学习统计">
        <div className="v2-list-row"><span>累计学习单词</span><b>{stats.totalWords} 个</b></div>
      </section>

      <section className="v2-setting">
        <div><b>每日目标</b><span>今天希望完成多少个单词</span></div>
        <input type="number" min="5" max="100" value={goal} onChange={e => setGoal(e.target.value)} />
      </section>

      <button className="v2-secondary v2-wide" onClick={() => { storage.set('onboarded', '1'); setSaved(true); }}>
        {saved ? '已保存' : '保存设置'}
      </button>
      <button className="v2-text-button v2-danger" onClick={onLogout}>退出账户</button>
    </main>
  );
}
