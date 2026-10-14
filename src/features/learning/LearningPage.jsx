import { useEffect } from 'react';
import { useLearningSession } from './useLearningSession.js';

function verificationTitle(type) {
  if (type === 'choice') return '选出正确释义';
  if (type === 'spelling') return '拼写验证';
  if (type === 'dictation') return '听音默写';
  return '语境验证';
}

function exampleText(word) {
  const example = String(word?.example || '').trim();
  return example || '请根据单词含义完成验证。';
}

export default function LearningPage({ wordList, sourceKey, goal, onExit, onGarden }) {
  const session = useLearningSession(wordList, sourceKey, goal);
  const word = session.currentWord;
  const type = session.verification?.verification;

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onExit();
      if (
        event.key === 'Enter' &&
        session.phase === 'card' &&
        type !== 'choice' &&
        session.answer.trim()
      ) {
        session.submit(session.answer);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, session.answer, session.phase, session.submit, type]);

  if (!wordList.length) {
    return (
      <main className="v2-page v2-empty">
        <h1>还没有可学习的单词</h1>
        <p>请先选择教材与单元。</p>
        <button className="v2-primary" onClick={onExit}>返回</button>
      </main>
    );
  }

  if (session.completed) {
    return (
      <main className="v2-page v2-complete">
        <p className="v2-eyebrow">第 {session.stage} 阶段完成</p>
        <div className="v2-complete-symbol">✦</div>
        <h1>这一阶段完成了</h1>
        <p>已完成 {session.used} / {session.base} 个有效学习事件。</p>
        <div className="v2-actions">
          <button className="v2-primary" onClick={session.nextStage}>下一阶段</button>
          <button className="v2-secondary" onClick={onGarden}>去花园收取种子</button>
          <button className="v2-text-button" onClick={onExit}>返回首页</button>
        </div>
      </main>
    );
  }

  return (
    <main className="v2-page v2-learning">
      <header className="v2-learning-top">
        <button className="v2-text-button" onClick={onExit}>‹ 返回</button>
        <span>第 {session.used + 1} 颗种子</span>
        <strong>{session.used} / {session.base}</strong>
      </header>

      {session.phase === 'idle' && (
        <section className="v2-learning-intro">
          <p className="v2-eyebrow">第 {session.stage} 阶段</p>
          <h1>准备种下下一颗种子</h1>
          <p className="v2-muted">今天的学习目标是 {session.base} 个单词。</p>
          <button className="v2-primary" onClick={session.start}>开始</button>
        </section>
      )}

      {session.phase === 'card' && word && (
        <section className="v2-word-card">
          <div className="v2-word-index">
            SEED {session.used + 1} · {verificationTitle(type)}
          </div>

          <div className="v2-word">{word.word || word.w}</div>
          {word.phonetic && (
            <div className="v2-phonetic">/{word.phonetic}/</div>
          )}

          {type === 'choice' && (
            <div className="v2-verification-options">
              {session.options.map(option => (
                <button
                  key={option}
                  type="button"
                  className="v2-secondary v2-option"
                  disabled={session.busy}
                  onClick={() => session.submit(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {type === 'spelling' && (
            <>
              <div className="v2-meaning">{word.meaning || word.m || '暂无释义'}</div>
              <div className="v2-dictation">
                <input
                  autoFocus
                  value={session.answer}
                  onChange={event => session.setAnswer(event.target.value)}
                  placeholder="输入英文单词"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  disabled={session.busy}
                />
                <button
                  type="button"
                  className="v2-primary"
                  disabled={session.busy}
                  onClick={() => session.submit(session.answer)}
                >
                  确认
                </button>
              </div>
            </>
          )}

          {type === 'dictation' && (
            <>
              <p className="v2-muted">先听发音，再输入你听到的单词。</p>
              <button
                type="button"
                className="v2-secondary v2-speak-button"
                onClick={session.speak}
              >
                ▶ 播放发音
              </button>
              <div className="v2-dictation">
                <input
                  autoFocus
                  value={session.answer}
                  onChange={event => session.setAnswer(event.target.value)}
                  placeholder="输入你听到的单词"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  disabled={session.busy}
                />
                <button
                  type="button"
                  className="v2-primary"
                  disabled={session.busy}
                  onClick={() => session.submit(session.answer)}
                >
                  确认
                </button>
              </div>
            </>
          )}

          {type === 'usage' && (
            <>
              <div className="v2-example v2-usage-example">
                {exampleText(word)}
                {word.exampleCn && <small>{word.exampleCn}</small>}
              </div>
              <div className="v2-dictation">
                <input
                  autoFocus
                  value={session.answer}
                  onChange={event => session.setAnswer(event.target.value)}
                  placeholder="输入缺少的单词"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  disabled={session.busy}
                />
                <button
                  type="button"
                  className="v2-primary"
                  disabled={session.busy}
                  onClick={() => session.submit(session.answer)}
                >
                  确认
                </button>
              </div>
            </>
          )}

          {session.feedback && (
            <p className={session.feedback.ok ? 'v2-success' : 'v2-error'}>
              {session.feedback.message}
            </p>
          )}

          <button type="button" className="v2-text-button" onClick={onExit}>
            暂停并返回
          </button>
        </section>
      )}
    </main>
  );
}
