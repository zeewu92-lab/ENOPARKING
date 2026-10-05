import { useEffect, useState } from 'react';
import { huoquDanweiList, huoquTextbooks } from '../../api/vocab.js';
import { storage } from '../../utils/storage.js';

export default function SetupPage({ onDone, onBack }) {
  const [books, setBooks] = useState([]);
  const [units, setUnits] = useState([]);
  const [book, setBook] = useState(storage.get('textbook') || 'pep-2019-required-1');
  const [selected, setSelected] = useState(storage.getJSON('selectedUnits', []));
  const [goal, setGoal] = useState(Number(localStorage.getItem('engnocrazy:dailyGoal')) || 10);

  useEffect(() => {
    huoquTextbooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  useEffect(() => {
    huoquDanweiList(book).then(list => {
      setUnits(Array.isArray(list) ? list : []);
      if (!selected.length && Array.isArray(list) && list[0]) setSelected([list[0].id]);
    }).catch(() => setUnits([]));
  }, [book]);

  function save() {
    if (!book || !selected.length) return;
    storage.set('textbook', book);
    storage.setJSON('selectedUnits', selected);
    localStorage.setItem('engnocrazy:dailyGoal', String(Math.max(5, Math.min(100, Number(goal) || 10))));
    localStorage.setItem('engnocrazy:onboarded', '1');
    onDone();
  }

  return (
    <main className="v2-page">
      <header className="v2-section-head">
        <button className="v2-text-button" onClick={onBack}>‹ 返回</button>
        <div><p className="v2-eyebrow">学习设置</p><h1>学习设置</h1></div>
      </header>

      <section className="v2-setting-block">
        <label>教材<select value={book} onChange={e => { setBook(e.target.value); setSelected([]); }}>
          {books.map(item => <option key={item.id} value={item.id}>{item.name || item.volume || item.id} · {item.volume || ''}</option>)}
        </select></label>

        <div className="v2-unit-grid">
          {units.map(unit => (
            <button key={unit.id} className={selected.includes(unit.id) ? 'is-selected' : ''} onClick={() => setSelected(value => value.includes(unit.id) ? value.filter(id => id !== unit.id) : [...value, unit.id])}>
              <span>{unit.name || unit.id}</span><small>{unit.count || 0} 个</small>
            </button>
          ))}
        </div>

        <label>每日目标<input type="number" min="5" max="100" value={goal} onChange={e => setGoal(e.target.value)} /></label>
        <button className="v2-primary v2-wide" disabled={!selected.length} onClick={save}>保存并开始</button>
      </section>
    </main>
  );
}
