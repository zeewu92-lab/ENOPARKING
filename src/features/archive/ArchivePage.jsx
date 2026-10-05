import { huoquCuowuShu } from '../../utils/wrongBook.js';
import { huoquXuexiTongji } from '../../utils/learningStats.js';

export default function ArchivePage() {
  const stats = huoquXuexiTongji();
  const wrong = huoquCuowuShu();

  return (
    <main className="v2-page">
      <header className="v2-section-head">
        <div><p className="v2-eyebrow">学习档案</p><h1>档案</h1></div>
      </header>

      <section className="v2-list">
        <div className="v2-list-row"><span>累计学习</span><b>{stats.totalWords}</b></div>
        <div className="v2-list-row"><span>学习天数</span><b>{stats.studyDays}</b></div>
        <div className="v2-list-row"><span>连续学习</span><b>{stats.streak}</b></div>
        <div className="v2-list-row"><span>错词</span><b>{wrong.length}</b></div>
      </section>
    </main>
  );
}
