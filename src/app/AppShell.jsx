import { useEffect, useMemo, useState } from 'react';
import { zhanghuMe, tuichuZhanghu } from '../api/account.js';
import { huoquVocab } from '../api/vocab.js';
import { storage } from '../utils/storage.js';
import AccountScreen from '../features/account/AccountScreen.jsx';
import HomePage from '../features/home/HomePage.jsx';
import SetupPage from '../features/home/SetupPage.jsx';
import LearningPage from '../features/learning/LearningPage.jsx';
import GardenPage from '../features/garden/GardenPage.jsx';
import ArchivePage from '../features/archive/ArchivePage.jsx';
import ProfilePage from '../features/profile/ProfilePage.jsx';
import { addNectarReward } from '../utils/gardenState.js';

const ACCOUNT_GATE_ENABLED = true;

function loadConfig() {
  const textbook = storage.get('textbook') || 'pep-2019-required-1';
  const selectedUnits = storage.getJSON('selectedUnits', []);
  const goal = Number(localStorage.getItem('engnocrazy:dailyGoal')) || 10;
  return { textbook, selectedUnits, goal };
}

export default function AppShell() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(!ACCOUNT_GATE_ENABLED);
  const [view, setView] = useState('home');
  const [config, setConfig] = useState(loadConfig);
  const [words, setWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(false);
  const [error, setError] = useState('');
  const [longWordChallenge, setLongWordChallenge] = useState(false);
  const [challengeRewarded, setChallengeRewarded] = useState(false);

  useEffect(() => {
    if (!ACCOUNT_GATE_ENABLED) return;
    zhanghuMe()
      .then(result => setUser(result?.user || result))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    const sources = config.selectedUnits.map(unit => `${config.textbook}:${unit}`);
    if (!sources.length) {
      setWords([]);
      return;
    }

    setLoadingWords(true);
    setError('');
    huoquVocab(sources)
      .then(list => setWords(Array.isArray(list) ? list : []))
      .catch(err => {
        setWords([]);
        setError(err.message || '词库加载失败');
      })
      .finally(() => setLoadingWords(false));
  }, [user, config.textbook, config.selectedUnits.join(',')]);

  const sourceKey = useMemo(
    () => [config.textbook, ...config.selectedUnits, config.goal].join('|'),
    [config.textbook, config.selectedUnits, config.goal]
  );

  function refreshConfig() {
    setConfig(loadConfig());
    setView('home');
  }

  function updateGoal(goal) {
    setConfig(current => ({ ...current, goal: Number(goal) || 10 }));
  }

  async function logout() {
    try { await tuichuZhanghu(); } catch {}
    setUser(null);
    setView('home');
  }

  if (!authChecked) {
    return <main className="v2-loading"><span>正在加载语未央…</span></main>;
  }

  if (!user) {
    return <AccountScreen onAuthenticated={result => setUser(result?.user || result)} />;
  }

  if (view === 'setup') {
    return <SetupPage onDone={refreshConfig} onBack={() => setView('home')} />;
  }

  if (view === 'learning') {
    const longWords = words.filter(item => {
      const value = String(item?.word || item?.w || '').trim();
      return /^[a-z]+$/i.test(value) && value.length >= 8;
    });
    const activeWordList = longWordChallenge ? longWords : words;
    const activeGoal = longWordChallenge ? Math.min(5, longWords.length) : config.goal;
    return (
      <LearningPage
        wordList={activeWordList}
        sourceKey={longWordChallenge ? sourceKey + '|long-word-challenge' : sourceKey}
        goal={activeGoal}
        challengeMode={longWordChallenge}
        challengeRewarded={challengeRewarded}
        onChallengeComplete={() => {
          const key = 'engnocrazy:longWordReward:' + new Date().toISOString().slice(0, 10);
          if (localStorage.getItem(key)) return false;
          addNectarReward(10);
          localStorage.setItem(key, '1');
          setChallengeRewarded(true);
          return true;
        }}
        onExit={() => { setLongWordChallenge(false); setView('home'); }}
        onGarden={() => { setLongWordChallenge(false); setView('garden'); }}
      />
    );
  }

  if (view === 'garden') {
    return <GardenPage onBack={() => setView('home')} />;
  }

  return (
    <div className="v2-app">
      <div className="v2-content">
        {view === 'home' && (
          <HomePage
            user={user}
            wordCount={words.length}
            goal={config.goal}
            onStart={() => { setLongWordChallenge(false); setChallengeRewarded(false); setView(config.selectedUnits.length ? 'learning' : 'setup'); }}
            onLongWordChallenge={() => {
              const available = words.filter(item => /^[a-z]+$/i.test(String(item?.word || item?.w || '').trim()) && String(item?.word || item?.w || '').trim().length >= 8);
              if (!config.selectedUnits.length) { setView('setup'); return; }
              if (!available.length) { setError('当前词库没有可用于长词突破的单词，请先更换或添加词库。'); return; }
              const key = 'engnocrazy:longWordReward:' + new Date().toISOString().slice(0, 10);
              setChallengeRewarded(Boolean(localStorage.getItem(key)));
              setLongWordChallenge(true);
              setView('learning');
            }}
            onSetup={() => setView('setup')}
            onGarden={() => setView('garden')}
            onArchive={() => setView('archive')}
            onProfile={() => setView('profile')}
          />
        )}
        {view === 'archive' && <ArchivePage />}
        {view === 'profile' && <ProfilePage user={user} onGoalChange={updateGoal} onLogout={logout} />}
        {view !== 'home' && (
          <div className="home-return-wrap">
            <button className="v2-text-button" onClick={() => setView('home')}>← 返回学习首页</button>
          </div>
        )}
        {error && <p className="v2-global-error">{error}</p>}
        {loadingWords && <div className="v2-loading-strip">正在整理词库…</div>}
      </div>
    </div>
  );
}
